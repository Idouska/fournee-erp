import { detail, info, ok, step, warn } from '../log.js';
import { exportPath, writeJson } from '../util.js';

const DATASETS = [
  ['shop', 'boutique'],
  ['locations', 'emplacements'],
  ['publications', 'canaux de vente'],
  ['metafieldDefinitions', 'définitions de métachamps'],
  ['metaobjectDefinitions', 'définitions de métaobjets'],
  ['metaobjects', 'métaobjets'],
  ['products', 'produits'],
  ['collections', 'collections'],
  ['pages', 'pages'],
  ['blogs', 'blogs'],
  ['articles', 'articles'],
  ['menus', 'menus'],
  ['files', 'fichiers'],
  ['redirects', 'redirections'],
  ['policies', 'politiques légales'],
  ['deliveryProfiles', "profils d'expédition"],
  ['markets', 'marchés'],
  ['locales', 'langues'],
  ['customers', 'clients']
];

export async function run(ctx) {
  step('1. Audit de la source et export JSON');
  info(`Source : ${ctx.config.source.shop} (API ${ctx.src.apiVersion})`);

  const summary = {};
  for (const [name, label] of DATASETS) {
    const data = await ctx.source.tryGet(name, null);
    if (data === null) {
      summary[name] = null;
      continue;
    }
    const count = Array.isArray(data) ? data.length : 1;
    summary[name] = count;
    detail(`${String(count).padStart(6)}  ${label}`);
  }

  const products = (await ctx.source.tryGet('products')) || [];
  summary.variants = products.reduce((n, p) => n + (p.variants?.nodes?.length || 0), 0);
  summary.productMedia = products.reduce((n, p) => n + (p.media?.nodes?.length || 0), 0);
  summary.productMetafields = products.reduce((n, p) => n + (p.metafields?.nodes?.length || 0), 0);
  detail(`${String(summary.variants).padStart(6)}  variantes`);
  detail(`${String(summary.productMedia).padStart(6)}  médias produit`);

  const truncated = products.filter((p) => p.variants?.pageInfo?.hasNextPage);
  if (truncated.length) {
    warn(`${truncated.length} produit(s) ont plus de 100 variantes : seules les 100 premières sont exportées (${truncated.slice(0, 3).map((p) => p.handle).join(', ')})`);
  }

  try {
    const counts = await ctx.source.get('counts');
    if (counts?.productsCount?.count !== undefined && summary.products !== null) {
      if (counts.productsCount.count !== summary.products && !ctx.config.limit) {
        warn(`Compteur API : ${counts.productsCount.count} produits, export : ${summary.products}`);
      }
    }
    summary.orders = counts?.ordersCount?.count ?? null;
  } catch {
    detail('compteurs globaux indisponibles (droit read_orders manquant ?)');
  }

  await writeJson(exportPath('audit.json'), { generatedAt: ctx.startedAt, shop: ctx.config.source.shop, summary });
  ctx.report.audit = summary;
  ok(`Export JSON complet dans ${exportPath('')}`);
}
