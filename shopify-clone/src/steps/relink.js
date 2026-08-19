import { detail, fail, info, ok, step, warn } from '../log.js';
import { chunk } from '../util.js';
import { M_MO_UPDATE } from './metafields.js';

const M_METAFIELDS_SET = `
mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id }
    userErrors { field message code }
  }
}`;

/**
 * Deuxième passe : les métachamps et champs de métaobjets qui pointaient vers
 * des ressources pas encore créées au moment de leur écriture (un métaobjet
 * écrit avant les produits, par exemple) sont réécrits ici, une fois que toute
 * la boutique existe côté destination.
 */
export async function run(ctx) {
  step('9. Reprise des références croisées');

  const pending = ctx.maps.data.unresolved || [];
  if (!pending.length) {
    ok('Aucune référence en attente.');
    return;
  }
  info(`${pending.length} référence(s) à reprendre.`);

  const metafieldOps = [];
  const metaobjectOps = new Map();
  const stillUnresolved = [];

  for (const entry of pending) {
    const { value, resolved } = ctx.maps.remapValue(entry.value);
    if (!resolved) {
      stillUnresolved.push(entry);
      continue;
    }
    const ownerId = entry.srcId ? ctx.maps.remapGid(entry.srcId) : null;
    if (!ownerId) {
      stillUnresolved.push(entry);
      continue;
    }
    if (entry.kind === 'metaobject') {
      if (!metaobjectOps.has(ownerId)) metaobjectOps.set(ownerId, []);
      metaobjectOps.get(ownerId).push({ key: entry.key, value });
    } else {
      metafieldOps.push({ ownerId, namespace: entry.namespace, key: entry.key, type: entry.type, value });
    }
  }

  let fixed = 0;

  for (const [id, fields] of metaobjectOps) {
    try {
      await ctx.dst.mutate(M_MO_UPDATE, { id, metaobject: { fields } }, 'metaobjectUpdate');
      fixed += fields.length;
    } catch (err) {
      fail(`métaobjet ${id} : ${err.message}`);
    }
  }

  // Le type est nécessaire pour metafieldsSet : on le retrouve dans l'export source.
  if (metafieldOps.length) {
    const types = new Map();
    for (const name of ['products', 'collections', 'pages', 'blogs', 'articles']) {
      for (const node of (await ctx.source.tryGet(name)) || []) {
        for (const mf of node.metafields?.nodes || []) types.set(`${mf.namespace}.${mf.key}`, mf.type);
        for (const variant of node.variants?.nodes || []) {
          for (const mf of variant.metafields?.nodes || []) types.set(`${mf.namespace}.${mf.key}`, mf.type);
        }
      }
    }
    const withTypes = metafieldOps.map((op) => ({ ...op, type: op.type || types.get(`${op.namespace}.${op.key}`) })).filter((op) => op.type);
    for (const batch of chunk(withTypes, 25)) {
      try {
        await ctx.dst.mutate(M_METAFIELDS_SET, { metafields: batch }, 'metafieldsSet');
        fixed += batch.length;
      } catch (err) {
        fail(`métachamps (lot de ${batch.length}) : ${err.message}`);
      }
    }
  }

  ctx.maps.data.unresolved = stillUnresolved;
  await ctx.maps.save();

  ok(`${fixed} référence(s) reliée(s).`);
  if (stillUnresolved.length) {
    warn(`${stillUnresolved.length} référence(s) restent orphelines (ressource absente de la source ou non copiable).`);
    for (const entry of stillUnresolved.slice(0, 5)) {
      detail(`${entry.kind} ${entry.handle || ''} → ${entry.namespace ? `${entry.namespace}.` : ''}${entry.key}`);
    }
  }
  ctx.report.relink = { pending: pending.length, fixed, stillUnresolved: stillUnresolved.length };
}
