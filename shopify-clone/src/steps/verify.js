import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { detail, fail, info, ok, step, warn } from '../log.js';
import { Q_IDS, Q_METAOBJECTS } from '../queries.js';
import { baseFileName, unique } from '../util.js';
import { indexDestinationFiles } from './files.js';
import { THEME_DIR } from './theme.js';

const COUNTED = [
  ['products', 'produits'],
  ['productVariants', 'variantes'],
  ['collections', 'collections'],
  ['pages', 'pages'],
  ['blogs', 'blogs'],
  ['articles', 'articles'],
  ['menus', 'menus'],
  ['files', 'fichiers'],
  ['urlRedirects', 'redirections'],
  ['customers', 'clients'],
  ['metaobjectDefinitions', 'définitions de métaobjets']
];

async function countAll(client, key) {
  const nodes = await client.collect(Q_IDS[key], {}, (d) => Object.values(d)[0], { pageSize: 250 });
  return nodes;
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

async function checkTheme(ctx) {
  try {
    await stat(THEME_DIR);
  } catch {
    info('Pas de dossier ./theme : contrôle des références du thème ignoré.');
    return null;
  }

  const files = (await walk(THEME_DIR)).filter((f) => f.endsWith('.json') || f.endsWith('.liquid'));
  if (!files.length) return null;

  const destFiles = await indexDestinationFiles(ctx);
  const destHandles = {
    product: new Set((await countAll(ctx.dst, 'products')).map((n) => n.handle)),
    collection: new Set((await countAll(ctx.dst, 'collections')).map((n) => n.handle)),
    page: new Set((await countAll(ctx.dst, 'pages')).map((n) => n.handle)),
    blog: new Set((await countAll(ctx.dst, 'blogs')).map((n) => n.handle)),
    article: new Set((await countAll(ctx.dst, 'articles')).map((n) => n.handle))
  };

  const missingImages = new Set();
  const missingHandles = new Set();

  for (const file of files) {
    const content = await readFile(file, 'utf8').catch(() => '');
    if (!content) continue;
    const where = relative(process.cwd(), file);

    for (const match of content.matchAll(/shopify:\/\/shop_images\/([^"'\\?\s)]+)/g)) {
      const name = baseFileName(`https://x/${match[1]}`);
      if (name && !destFiles.has(name) && !ctx.maps.data.fileNames[name]) missingImages.add(`${name}  (${where})`);
    }
    for (const match of content.matchAll(/"(product|collection|page|blog|article)"\s*:\s*"([a-z0-9][a-z0-9-_]*)"/g)) {
      const [, kind, handle] = match;
      if (!destHandles[kind].has(handle)) missingHandles.add(`${kind}:${handle}  (${where})`);
    }
  }

  return { files: files.length, missingImages: [...missingImages], missingHandles: [...missingHandles] };
}

export async function run(ctx) {
  step('12. Vérification');

  if (ctx.config.limit) {
    warn(`--limit=${ctx.config.limit} est actif : les compteurs ne peuvent pas correspondre.`);
  }

  const rows = [];
  for (const [key, label] of COUNTED) {
    try {
      const [source, destination] = await Promise.all([countAll(ctx.src, key), countAll(ctx.dst, key)]);
      rows.push({ key, label, source: source.length, destination: destination.length });
    } catch (err) {
      rows.push({ key, label, source: null, destination: null, error: err.message });
    }
  }

  // Métaobjets : compte par type, sur les types présents des deux côtés.
  try {
    const types = unique(((await ctx.source.tryGet('metaobjectDefinitions')) || []).map((d) => d.type));
    let src = 0;
    let dst = 0;
    for (const type of types) {
      const [a, b] = await Promise.all([
        ctx.src.collect(Q_METAOBJECTS, { type }, (d) => d.metaobjects, { pageSize: 100 }).catch(() => []),
        ctx.dst.collect(Q_METAOBJECTS, { type }, (d) => d.metaobjects, { pageSize: 100 }).catch(() => [])
      ]);
      src += a.length;
      dst += b.length;
    }
    rows.push({ key: 'metaobjects', label: 'métaobjets', source: src, destination: dst });
  } catch (err) {
    detail(`comptage des métaobjets impossible : ${err.message}`);
  }

  const gaps = [];
  for (const row of rows) {
    if (row.error) {
      warn(`${row.label} : comptage impossible (${row.error})`);
      continue;
    }
    const diff = row.destination - row.source;
    const line = `${row.label.padEnd(28)} source ${String(row.source).padStart(6)}   destination ${String(row.destination).padStart(6)}`;
    if (diff === 0) ok(line);
    else {
      fail(`${line}   écart ${diff > 0 ? '+' : ''}${diff}`);
      gaps.push({ ...row, diff });
    }
  }

  const theme = await checkTheme(ctx);
  if (theme) {
    info(`${theme.files} fichier(s) de thème analysés.`);
    if (theme.missingImages.length) {
      fail(`${theme.missingImages.length} image(s) référencée(s) par le thème absente(s) de la destination :`);
      for (const item of theme.missingImages.slice(0, 15)) detail(item);
    } else ok('Toutes les images référencées par le thème existent sur la destination.');
    if (theme.missingHandles.length) {
      fail(`${theme.missingHandles.length} référence(s) de handle non résolue(s) dans le thème :`);
      for (const item of theme.missingHandles.slice(0, 15)) detail(item);
    } else ok('Tous les handles référencés par le thème existent sur la destination.');
  }

  ctx.report.verify = { rows, gaps, theme };
}
