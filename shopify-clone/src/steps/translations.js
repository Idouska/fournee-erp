import { detail, fail, info, ok, progress, step, warn } from '../log.js';
import { chunk } from '../util.js';

const RESOURCE_TYPES = [
  'PRODUCT',
  'PRODUCT_OPTION',
  'PRODUCT_OPTION_VALUE',
  'COLLECTION',
  'ONLINE_STORE_PAGE',
  'ONLINE_STORE_BLOG',
  'ONLINE_STORE_ARTICLE',
  'METAOBJECT',
  'SHOP_POLICY'
];

const Q_SOURCE_TRANSLATIONS = `
query SourceTranslations($resourceType: TranslatableResourceType!, $locale: String!, $pageSize: Int!, $cursor: String) {
  translatableResources(resourceType: $resourceType, first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      resourceId
      translations(locale: $locale) { key value locale }
    }
  }
}`;

const Q_DEST_DIGESTS = `
query DestDigests($resourceType: TranslatableResourceType!, $pageSize: Int!, $cursor: String) {
  translatableResources(resourceType: $resourceType, first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      resourceId
      translatableContent { key digest }
    }
  }
}`;

const M_REGISTER = `
mutation TranslationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
  translationsRegister(resourceId: $resourceId, translations: $translations) {
    translations { key locale }
    userErrors { field message code }
  }
}`;

export async function run(ctx) {
  step('10. Traductions');

  const locales = (await ctx.source.tryGet('locales')) || [];
  const secondary = locales.filter((l) => !l.primary);
  if (!secondary.length) {
    ok('Boutique monolingue : rien à traduire.');
    return;
  }
  info(`Langues secondaires : ${secondary.map((l) => l.locale).join(', ')}`);

  let registered = 0;
  let skipped = 0;

  for (const resourceType of RESOURCE_TYPES) {
    let destDigests;
    try {
      const nodes = await ctx.dst.collect(Q_DEST_DIGESTS, { resourceType }, (d) => d.translatableResources, { pageSize: 50 });
      destDigests = new Map(nodes.map((n) => [n.resourceId, new Map((n.translatableContent || []).map((c) => [c.key, c.digest]))]));
    } catch (err) {
      detail(`${resourceType} : contenus traduisibles illisibles côté destination (${err.message})`);
      continue;
    }
    if (!destDigests.size) continue;

    for (const locale of secondary) {
      let sourceNodes;
      try {
        sourceNodes = await ctx.src.collect(
          Q_SOURCE_TRANSLATIONS,
          { resourceType, locale: locale.locale },
          (d) => d.translatableResources,
          { pageSize: 50 }
        );
      } catch (err) {
        detail(`${resourceType}/${locale.locale} : ${err.message}`);
        continue;
      }

      const withTranslations = sourceNodes.filter((n) => n.translations?.length);
      let done = 0;
      for (const node of withTranslations) {
        const destId = ctx.maps.remapGid(node.resourceId);
        if (!destId) {
          skipped += node.translations.length;
          continue;
        }
        const digests = destDigests.get(destId);
        if (!digests) {
          skipped += node.translations.length;
          continue;
        }
        const translations = node.translations
          .filter((t) => digests.has(t.key) && t.value)
          .map((t) => ({ key: t.key, value: t.value, locale: t.locale, translatableContentDigest: digests.get(t.key) }));
        if (!translations.length) continue;
        for (const batch of chunk(translations, 25)) {
          try {
            await ctx.dst.mutate(M_REGISTER, { resourceId: destId, translations: batch }, 'translationsRegister');
            registered += batch.length;
          } catch (err) {
            fail(`traduction ${resourceType} ${locale.locale} : ${err.message}`);
          }
        }
        progress((done += 1), withTranslations.length, `${resourceType} ${locale.locale}`);
      }
    }
  }

  ok(`${registered} traduction(s) enregistrée(s).`);
  if (skipped) warn(`${skipped} traduction(s) ignorée(s) : ressource sans équivalent sur la destination.`);
  info("Les traductions du thème sont dans locales/*.json et suivent l'envoi du thème.");
  ctx.report.translations = { locales: secondary.map((l) => l.locale), registered, skipped };
}
