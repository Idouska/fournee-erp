import { detail, fail, info, ok, progress, step, warn } from '../log.js';
import { chunk, cleanCdnUrl, compact } from '../util.js';
import { metafieldInputs, publicationMapping, publishLike } from './products.js';

const M_CREATE = `
mutation CollectionCreate($input: CollectionInput!) {
  collectionCreate(input: $input) {
    collection { id handle }
    userErrors { field message }
  }
}`;

const M_UPDATE = `
mutation CollectionUpdate($input: CollectionInput!) {
  collectionUpdate(input: $input) {
    collection { id handle }
    userErrors { field message }
  }
}`;

const M_ADD = `
mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) {
  collectionAddProducts(id: $id, productIds: $productIds) {
    collection { id }
    userErrors { field message }
  }
}`;

const M_REMOVE = `
mutation CollectionRemoveProducts($id: ID!, $productIds: [ID!]!) {
  collectionRemoveProducts(id: $id, productIds: $productIds) {
    job { id done }
    userErrors { field message }
  }
}`;

const M_REORDER = `
mutation CollectionReorderProducts($id: ID!, $moves: [MoveInput!]!) {
  collectionReorderProducts(id: $id, moves: $moves) {
    job { id done }
    userErrors { field message }
  }
}`;

const Q_DEST_COLLECTIONS = `
query DestCollections($pageSize: Int!, $cursor: String) {
  collections(first: $pageSize, after: $cursor, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle sortOrder
      ruleSet { appliedDisjunctively }
      products(first: 250) { nodes { id } }
    }
  }
}`;

export async function run(ctx) {
  step('5. Collections');

  const collections = await ctx.source.get('collections');
  const destCollections = await ctx.dst.collect(Q_DEST_COLLECTIONS, {}, (d) => d.collections, { pageSize: 10 });
  const destByHandle = new Map(destCollections.map((c) => [c.handle, c]));
  const pubMap = await publicationMapping(ctx);
  info(`${collections.length} collection(s) source · ${destCollections.length} déjà présente(s)`);

  let created = 0;
  let updated = 0;
  let published = 0;
  let missingProducts = 0;

  for (const [index, collection] of collections.entries()) {
    const existing = destByHandle.get(collection.handle);
    const automatic = Boolean(collection.ruleSet);

    // Membres manuels, dans l'ordre de la source.
    const desired = [];
    if (!automatic) {
      for (const product of collection.products?.nodes || []) {
        const destId = ctx.maps.get('products', product.id);
        if (destId) desired.push(destId);
        else missingProducts += 1;
      }
      if (collection.products?.pageInfo?.hasNextPage) {
        warn(`collection ${collection.handle} : plus de 250 produits, seuls les 250 premiers sont repris`);
      }
    }

    const input = compact({
      id: existing?.id,
      handle: collection.handle,
      title: collection.title,
      descriptionHtml: ctx.rewrite(collection.descriptionHtml),
      sortOrder: collection.sortOrder,
      templateSuffix: collection.templateSuffix || undefined,
      seo: compact({ title: collection.seo?.title, description: collection.seo?.description }),
      image: collection.image?.url
        ? compact({ src: cleanCdnUrl(collection.image.url), altText: collection.image.altText })
        : undefined,
      ruleSet: collection.ruleSet
        ? {
            appliedDisjunctively: collection.ruleSet.appliedDisjunctively,
            rules: (collection.ruleSet.rules || []).map((r) => ({ column: r.column, relation: r.relation, condition: r.condition }))
          }
        : undefined,
      products: !automatic && !existing ? desired : undefined,
      metafields: metafieldInputs(ctx, collection.metafields?.nodes, { kind: 'collection', handle: collection.handle, srcId: collection.id })
    });

    try {
      const pruned = await ctx.compat.prune('CollectionInput', input);
      const payload = existing
        ? await ctx.dst.mutate(M_UPDATE, { input: pruned }, 'collectionUpdate')
        : await ctx.dst.mutate(M_CREATE, { input: pruned }, 'collectionCreate');
      const destCollection = payload?.collection;
      if (destCollection) {
        ctx.maps.set('collections', collection.id, destCollection.id);
        if (existing) updated += 1;
        else created += 1;

        if (!automatic && existing) {
          const current = (existing.products?.nodes || []).map((p) => p.id);
          const toAdd = desired.filter((id) => !current.includes(id));
          const toRemove = current.filter((id) => !desired.includes(id));
          for (const batch of chunk(toAdd, 100)) {
            await ctx.dst.mutate(M_ADD, { id: destCollection.id, productIds: batch }, 'collectionAddProducts');
          }
          for (const batch of chunk(toRemove, 100)) {
            await ctx.dst.mutate(M_REMOVE, { id: destCollection.id, productIds: batch }, 'collectionRemoveProducts');
          }
        }

        if (!automatic && collection.sortOrder === 'MANUAL' && desired.length) {
          const moves = desired.map((id, position) => ({ id, newPosition: String(position) }));
          for (const batch of chunk(moves, 250)) {
            try {
              await ctx.dst.mutate(M_REORDER, { id: destCollection.id, moves: batch }, 'collectionReorderProducts');
            } catch (err) {
              detail(`ordre manuel non appliqué sur ${collection.handle} : ${err.message}`);
            }
          }
        }

        if (await publishLike(ctx, destCollection.id, collection.resourcePublications, pubMap)) published += 1;
      }
    } catch (err) {
      fail(`collection ${collection.handle} : ${err.message}`);
    }

    progress(index + 1, collections.length, 'collections');
    if ((index + 1) % 10 === 0) await ctx.maps.save();
  }

  await ctx.maps.save();
  ok(`${created} collection(s) créée(s), ${updated} mise(s) à jour, ${published} publiée(s).`);
  if (missingProducts) warn(`${missingProducts} appartenance(s) produit ignorée(s) : produit absent de la destination (relancer l'étape « products »).`);
  ctx.report.collections = { source: collections.length, created, updated, published, missingProducts };
}
