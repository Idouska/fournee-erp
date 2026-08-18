import { detail, fail, info, ok, progress, step, warn } from '../log.js';
import { baseFileName, chunk, cleanCdnUrl, fileNameFromUrl, sleep } from '../util.js';

const M_FILE_CREATE = `
mutation FileCreate($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files {
      id
      fileStatus
      alt
      ... on MediaImage { image { url } }
      ... on GenericFile { url }
    }
    userErrors { field message code }
  }
}`;

const Q_DEST_FILES = `
query DestFiles($pageSize: Int!, $cursor: String) {
  files(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id fileStatus alt
      preview { image { url } }
      ... on MediaImage { image { url } }
      ... on GenericFile { url }
      ... on Video { originalSource { url } }
    }
  }
}`;

/** URL source d'un fichier, quel que soit son type. */
export function sourceUrlOf(file) {
  return (
    file.image?.url ||
    file.url ||
    file.originalSource?.url ||
    file.preview?.image?.url ||
    null
  );
}

function contentTypeOf(file, url) {
  const mime = file.mimeType || '';
  if (mime.startsWith('image/') || file.image) return 'IMAGE';
  if (mime.startsWith('video/') || file.originalSource?.mimeType?.startsWith('video/')) return 'VIDEO';
  const ext = (url || '').split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg'].includes(ext)) return 'IMAGE';
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'VIDEO';
  return 'FILE';
}

/** Index des fichiers de la destination : nom de fichier -> { id, url, status } */
export async function indexDestinationFiles(ctx) {
  const index = new Map();
  const nodes = await ctx.dst.collect(Q_DEST_FILES, {}, (d) => d.files, { pageSize: 100 });
  for (const node of nodes) {
    const url = sourceUrlOf(node);
    const name = baseFileName(url);
    if (name) index.set(name, { id: node.id, url, status: node.fileStatus });
  }
  return index;
}

export async function run(ctx) {
  step('2. Fichiers (Contenu > Fichiers)');

  const [files, products] = await Promise.all([ctx.source.get('files'), ctx.source.tryGet('products')]);

  // Les images de médias produit reviennent avec les produits : on ne les recrée pas ici.
  const productMedia = new Set();
  for (const product of products || []) {
    for (const media of product.media?.nodes || []) {
      const name = baseFileName(media.image?.url || media.originalSource?.url);
      if (name) productMedia.add(name);
    }
  }

  const destIndex = await indexDestinationFiles(ctx);
  for (const [name, entry] of destIndex) ctx.maps.data.fileNames[name] = entry.id;

  const candidates = [];
  let skippedProductMedia = 0;
  for (const file of files) {
    const url = sourceUrlOf(file);
    const name = baseFileName(url);
    if (!url || !name) {
      warn(`Fichier sans URL exploitable, ignoré : ${file.id}`);
      continue;
    }
    if (productMedia.has(name)) {
      skippedProductMedia += 1;
      continue;
    }
    const existing = destIndex.get(name) || (ctx.maps.data.fileNames[name] ? { id: ctx.maps.data.fileNames[name] } : null);
    if (existing) {
      ctx.maps.set('files', file.id, existing.id);
      continue;
    }
    candidates.push({ file, url, name });
  }

  info(`${files.length} fichiers source · ${skippedProductMedia} médias produit ignorés · ${candidates.length} à créer`);
  if (!candidates.length) {
    ok('Aucun fichier à créer (destination déjà à jour).');
    return;
  }

  let created = 0;
  let done = 0;
  for (const batch of chunk(candidates, 20)) {
    const inputs = await Promise.all(
      batch.map(async (c) =>
        ctx.compat.prune('FileCreateInput', {
          originalSource: cleanCdnUrl(c.url),
          filename: fileNameFromUrl(c.url),
          alt: c.file.alt || undefined,
          contentType: contentTypeOf(c.file, c.url),
          duplicateResolutionMode: 'REPLACE'
        })
      )
    );
    try {
      const payload = await ctx.dst.mutate(M_FILE_CREATE, { files: inputs }, 'fileCreate');
      (payload?.files || []).forEach((node, i) => {
        const src = batch[i];
        ctx.maps.set('files', src.file.id, node.id);
        ctx.maps.data.fileNames[src.name] = node.id;
        created += 1;
      });
    } catch (err) {
      detail(`lot en erreur, reprise fichier par fichier : ${err.message}`);
      for (let i = 0; i < batch.length; i += 1) {
        try {
          const payload = await ctx.dst.mutate(M_FILE_CREATE, { files: [inputs[i]] }, 'fileCreate');
          const node = payload?.files?.[0];
          if (node) {
            ctx.maps.set('files', batch[i].file.id, node.id);
            ctx.maps.data.fileNames[batch[i].name] = node.id;
            created += 1;
          }
        } catch (single) {
          fail(`fichier ${batch[i].name} : ${single.message}`);
        }
      }
    }
    done += batch.length;
    progress(done, candidates.length, 'fichiers');
    await ctx.maps.save();
    await sleep(200);
  }

  ok(`${created} fichier(s) créé(s) sur la destination.`);
  ctx.report.files = { source: files.length, skippedProductMedia, created };

  // Contrôle de traitement (l'import CDN est asynchrone).
  await sleep(2000);
  const after = await ctx.dst.collect(Q_DEST_FILES, {}, (d) => d.files, { pageSize: 100 });
  const failed = after.filter((f) => f.fileStatus === 'FAILED');
  if (failed.length) warn(`${failed.length} fichier(s) en échec de traitement côté destination (voir Contenu > Fichiers).`);
}
