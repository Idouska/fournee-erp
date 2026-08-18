import { detail, fail, info, ok, step, warn } from '../log.js';
import { compact } from '../util.js';

const M_MENU_CREATE = `
mutation MenuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
  menuCreate(title: $title, handle: $handle, items: $items) {
    menu { id handle }
    userErrors { field message }
  }
}`;

const M_MENU_UPDATE = `
mutation MenuUpdate($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
  menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
    menu { id handle }
    userErrors { field message }
  }
}`;

const Q_DEST_MENUS = `
query DestMenus($pageSize: Int!, $cursor: String) {
  menus(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { id handle title }
  }
}`;

const Q_DEST_POLICIES = `query { shop { shopPolicies { id type } } }`;

/** Types de menu qui pointent vers une ressource identifiée. */
const RESOURCE_TYPES = new Set(['COLLECTION', 'PRODUCT', 'PAGE', 'BLOG', 'ARTICLE', 'METAOBJECT', 'SHOP_POLICY', 'CATALOG']);

export async function run(ctx) {
  step('7. Menus de navigation');

  const menus = await ctx.source.get('menus');
  const destMenus = await ctx.dst.collect(Q_DEST_MENUS, {}, (d) => d.menus, { pageSize: 50 });
  const destByHandle = new Map(destMenus.map((m) => [m.handle, m]));

  // Correspondance des politiques légales (menus « Politique de remboursement », etc.)
  try {
    const srcPolicies = (await ctx.source.tryGet('policies')) || [];
    const dstPolicies = (await ctx.dst.request(Q_DEST_POLICIES))?.shop?.shopPolicies || [];
    const byType = new Map(dstPolicies.map((p) => [p.type, p.id]));
    for (const policy of srcPolicies) {
      const destId = byType.get(policy.type);
      if (destId) ctx.maps.set('policies', policy.id, destId);
    }
  } catch (err) {
    detail(`politiques non mappées : ${err.message}`);
  }

  let fallbacks = 0;

  const convert = (item) => {
    const mapped = item.resourceId ? ctx.maps.remapGid(item.resourceId) || ctx.maps.get('policies', item.resourceId) : null;
    const children = (item.items || []).map(convert).filter(Boolean);
    if (RESOURCE_TYPES.has(item.type) && item.resourceId && !mapped) {
      // Ressource absente de la destination : on retombe sur un lien relatif.
      const url = ctx.rewrite(item.url) || '/';
      fallbacks += 1;
      detail(`« ${item.title} » (${item.type}) → lien relatif ${url}`);
      return compact({ title: item.title, type: 'HTTP', url, tags: item.tags, items: children });
    }
    return compact({
      title: item.title,
      type: item.type,
      url: item.type === 'HTTP' ? ctx.rewrite(item.url) : undefined,
      resourceId: mapped || undefined,
      tags: item.tags,
      items: children
    });
  };

  let created = 0;
  let updated = 0;

  for (const menu of menus) {
    const items = (menu.items || []).map(convert).filter(Boolean);
    const existing = destByHandle.get(menu.handle);
    try {
      if (existing) {
        const pruned = await ctx.compat.prune('MenuItemUpdateInput', items);
        await ctx.dst.mutate(M_MENU_UPDATE, { id: existing.id, title: menu.title, handle: menu.handle, items: pruned }, 'menuUpdate');
        updated += 1;
      } else {
        const pruned = await ctx.compat.prune('MenuItemCreateInput', items);
        await ctx.dst.mutate(M_MENU_CREATE, { title: menu.title, handle: menu.handle, items: pruned }, 'menuCreate');
        created += 1;
      }
    } catch (err) {
      fail(`menu ${menu.handle} : ${err.message}`);
    }
  }

  ok(`${created} menu(s) créé(s), ${updated} mis à jour.`);
  if (fallbacks) warn(`${fallbacks} entrée(s) de menu converties en lien relatif faute de ressource correspondante.`);
  info('Tous les liens absolus vers le domaine source ont été réécrits en liens relatifs.');
  ctx.report.menus = { source: menus.length, created, updated, fallbacks };
}
