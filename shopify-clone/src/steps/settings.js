import { detail, fail, info, ok, progress, step, warn } from '../log.js';
import { chunk, compact } from '../util.js';
import { metafieldInputs } from './products.js';

const M_POLICY_UPDATE = `
mutation ShopPolicyUpdate($shopPolicy: ShopPolicyInput!) {
  shopPolicyUpdate(shopPolicy: $shopPolicy) {
    shopPolicy { id type }
    userErrors { field message code }
  }
}`;

const M_REDIRECT_CREATE = `
mutation UrlRedirectCreate($urlRedirect: UrlRedirectInput!) {
  urlRedirectCreate(urlRedirect: $urlRedirect) {
    urlRedirect { id path target }
    userErrors { field message }
  }
}`;

const M_PROFILE_UPDATE = `
mutation DeliveryProfileUpdate($id: ID!, $profile: DeliveryProfileInput!) {
  deliveryProfileUpdate(id: $id, profile: $profile) {
    profile { id name }
    userErrors { field message }
  }
}`;

const M_LOCALE_ENABLE = `
mutation ShopLocaleEnable($locale: String!) {
  shopLocaleEnable(locale: $locale) {
    shopLocale { locale name primary published }
    userErrors { field message }
  }
}`;

const M_LOCALE_UPDATE = `
mutation ShopLocaleUpdate($locale: String!, $shopLocale: ShopLocaleInput!) {
  shopLocaleUpdate(locale: $locale, shopLocale: $shopLocale) {
    shopLocale { locale published }
    userErrors { field message }
  }
}`;

const M_CUSTOMER_CREATE = `
mutation CustomerCreate($input: CustomerInput!) {
  customerCreate(input: $input) {
    customer { id }
    userErrors { field message }
  }
}`;

const M_METAFIELDS_SET = `
mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id namespace key }
    userErrors { field message code }
  }
}`;

const Q_DEST_POLICIES = `query { shop { id shopPolicies { id type body } } }`;
const Q_DEST_REDIRECTS = `
query DestRedirects($pageSize: Int!, $cursor: String) {
  urlRedirects(first: $pageSize, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { id path } }
}`;
const Q_DEST_CUSTOMERS = `
query DestCustomers($pageSize: Int!, $cursor: String) {
  customers(first: $pageSize, after: $cursor, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes { id email phone }
  }
}`;
const Q_DEST_LOCALES = `query { shopLocales(published: false) { locale primary published } }`;
const Q_SHOP_METAFIELDS = `
query ShopMetafields($pageSize: Int!, $cursor: String) {
  shop { id metafields(first: $pageSize, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { namespace key type value } } }
}`;

async function copyPolicies(ctx) {
  const source = (await ctx.source.tryGet('policies')) || [];
  if (!source.length) return { copied: 0, total: 0 };
  const dest = (await ctx.dst.request(Q_DEST_POLICIES))?.shop?.shopPolicies || [];
  const byType = new Map(dest.map((p) => [p.type, p]));
  let copied = 0;
  for (const policy of source) {
    const target = byType.get(policy.type);
    if (!target) {
      detail(`politique ${policy.type} absente de la destination`);
      continue;
    }
    const body = ctx.rewrite(policy.body);
    if (!body || body === target.body) continue;
    try {
      await ctx.dst.mutate(M_POLICY_UPDATE, { shopPolicy: { id: target.id, body } }, 'shopPolicyUpdate');
      copied += 1;
    } catch (err) {
      fail(`politique ${policy.type} : ${err.message}`);
    }
  }
  ok(`${copied} politique(s) légale(s) copiée(s) sur ${source.length}.`);
  return { copied, total: source.length };
}

async function copyRedirects(ctx) {
  const source = (await ctx.source.tryGet('redirects')) || [];
  if (!source.length) return { created: 0, total: 0 };
  const dest = await ctx.dst.collect(Q_DEST_REDIRECTS, {}, (d) => d.urlRedirects, { pageSize: 250 });
  const existing = new Set(dest.map((r) => r.path));
  let created = 0;
  let done = 0;
  for (const redirect of source) {
    if (!existing.has(redirect.path)) {
      try {
        await ctx.dst.mutate(
          M_REDIRECT_CREATE,
          { urlRedirect: { path: redirect.path, target: ctx.rewrite(redirect.target) } },
          'urlRedirectCreate'
        );
        created += 1;
      } catch (err) {
        fail(`redirection ${redirect.path} : ${err.message}`);
      }
    }
    progress((done += 1), source.length, 'redirections');
  }
  ok(`${created} redirection(s) créée(s) sur ${source.length}.`);
  return { created, total: source.length };
}

function zoneInput(zone) {
  return compact({
    name: zone.zone.name,
    countries: (zone.zone.countries || []).map((country) =>
      compact({
        code: country.code?.restOfWorld ? undefined : country.code?.countryCode,
        restOfWorld: country.code?.restOfWorld || undefined,
        includeAllProvinces: !country.provinces?.length ? true : undefined,
        provinces: country.provinces?.length ? country.provinces.map((p) => ({ code: p.code })) : undefined
      })
    ),
    methodDefinitionsToCreate: (zone.methodDefinitions?.nodes || [])
      .filter((m) => m.rateProvider?.price)
      .map((method) =>
        compact({
          name: method.name,
          description: method.description || undefined,
          active: method.active,
          rateDefinition: { price: { amount: method.rateProvider.price.amount, currencyCode: method.rateProvider.price.currencyCode } },
          conditionsToCreate: (method.methodConditions || []).map((condition) =>
            compact({
              field: condition.field,
              operator: condition.operator,
              criteria: condition.conditionCriteria?.value ?? condition.conditionCriteria?.amount,
              criteriaUnit: condition.conditionCriteria?.unit || condition.conditionCriteria?.currencyCode
            })
          )
        })
      )
  });
}

async function copyShipping(ctx) {
  const source = (await ctx.source.tryGet('deliveryProfiles')) || [];
  const sourceDefault = source.find((p) => p.default);
  if (!sourceDefault) {
    warn("Aucun profil d'expédition par défaut sur la source.");
    return { zones: 0 };
  }

  let destProfiles;
  try {
    const { Q_DELIVERY_PROFILES } = await import('../queries.js');
    destProfiles = await ctx.dst.collect(Q_DELIVERY_PROFILES, {}, (d) => d.deliveryProfiles, { pageSize: 5 });
  } catch (err) {
    warn(`Profils d'expédition destination illisibles : ${err.message} — à recréer à la main.`);
    return { zones: 0 };
  }
  const destDefault = destProfiles.find((p) => p.default);
  const destGroup = destDefault?.profileLocationGroups?.[0];
  if (!destDefault || !destGroup) {
    warn("Profil d'expédition par défaut introuvable sur la destination — zones à recréer à la main.");
    return { zones: 0 };
  }

  const zonesToDelete = (destGroup.locationGroupZones?.nodes || []).map((z) => z.zone.id);
  const zonesToCreate = [];
  for (const group of sourceDefault.profileLocationGroups || []) {
    for (const zone of group.locationGroupZones?.nodes || []) zonesToCreate.push(zoneInput(zone));
  }
  if (!zonesToCreate.length) return { zones: 0 };

  const profile = compact({
    zonesToDelete,
    locationGroupsToUpdate: [{ id: destGroup.locationGroup.id, zonesToCreate }]
  });

  try {
    const pruned = await ctx.compat.prune('DeliveryProfileInput', profile);
    await ctx.dst.mutate(M_PROFILE_UPDATE, { id: destDefault.id, profile: pruned }, 'deliveryProfileUpdate');
    ok(`${zonesToCreate.length} zone(s) d'expédition recréée(s) (les zones existantes ont été remplacées).`);
    return { zones: zonesToCreate.length };
  } catch (err) {
    fail(`zones d'expédition : ${err.message}`);
    warn("Les tarifs d'expédition devront être recréés à la main (Paramètres > Expédition).");
    return { zones: 0 };
  }
}

async function copyLocales(ctx) {
  const source = (await ctx.source.tryGet('locales')) || [];
  if (source.length <= 1) return { enabled: 0 };
  const dest = (await ctx.dst.request(Q_DEST_LOCALES))?.shopLocales || [];
  const existing = new Map(dest.map((l) => [l.locale, l]));
  const primarySource = source.find((l) => l.primary);
  const primaryDest = dest.find((l) => l.primary);
  if (primarySource && primaryDest && primarySource.locale !== primaryDest.locale) {
    warn(
      `Langue principale différente : source ${primarySource.locale}, destination ${primaryDest.locale}. ` +
        `Le changement de langue principale se fait à la main (Paramètres > Langues).`
    );
  }
  let enabled = 0;
  for (const locale of source) {
    if (locale.primary || existing.has(locale.locale)) continue;
    try {
      await ctx.dst.mutate(M_LOCALE_ENABLE, { locale: locale.locale }, 'shopLocaleEnable');
      if (locale.published) {
        await ctx.dst.mutate(M_LOCALE_UPDATE, { locale: locale.locale, shopLocale: { published: true } }, 'shopLocaleUpdate');
      }
      enabled += 1;
    } catch (err) {
      fail(`langue ${locale.locale} : ${err.message}`);
    }
  }
  ok(`${enabled} langue(s) activée(s).`);
  return { enabled };
}

async function copyShopMetafields(ctx) {
  let source = [];
  try {
    source = await ctx.src.collect(Q_SHOP_METAFIELDS, {}, (d) => d.shop.metafields, { pageSize: 50 });
  } catch (err) {
    detail(`métachamps de boutique illisibles : ${err.message}`);
    return { copied: 0 };
  }
  const usable = metafieldInputs(ctx, source, { kind: 'shop' });
  if (!usable.length) return { copied: 0 };
  const destShop = (await ctx.dst.request(Q_DEST_POLICIES))?.shop;
  if (!destShop?.id) return { copied: 0 };
  let copied = 0;
  for (const batch of chunk(usable, 25)) {
    try {
      await ctx.dst.mutate(
        M_METAFIELDS_SET,
        { metafields: batch.map((mf) => ({ ...mf, ownerId: destShop.id })) },
        'metafieldsSet'
      );
      copied += batch.length;
    } catch (err) {
      fail(`métachamps de boutique : ${err.message}`);
    }
  }
  ok(`${copied} métachamp(s) de boutique copié(s).`);
  return { copied };
}

async function copyCustomers(ctx) {
  const source = (await ctx.source.tryGet('customers')) || [];
  if (!source.length) return { created: 0, total: 0 };
  const dest = await ctx.dst.collect(Q_DEST_CUSTOMERS, {}, (d) => d.customers, { pageSize: 100 });
  const existingEmails = new Set(dest.filter((c) => c.email).map((c) => c.email.toLowerCase()));
  const existingPhones = new Set(dest.filter((c) => c.phone).map((c) => c.phone));

  let created = 0;
  let skipped = 0;
  let done = 0;
  let emailFieldWarned = false;

  for (const customer of source) {
    const email = customer.email?.toLowerCase();
    if ((email && existingEmails.has(email)) || (customer.phone && existingPhones.has(customer.phone))) {
      skipped += 1;
      progress((done += 1), source.length, 'clients');
      continue;
    }
    if (!customer.email && !customer.phone) {
      skipped += 1;
      progress((done += 1), source.length, 'clients');
      continue;
    }

    const input = compact({
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      note: customer.note,
      tags: customer.tags,
      locale: customer.locale,
      taxExempt: customer.taxExempt,
      taxExemptions: customer.taxExemptions?.length ? customer.taxExemptions : undefined,
      addresses: (customer.addresses || []).map((a) =>
        compact({
          address1: a.address1,
          address2: a.address2,
          city: a.city,
          company: a.company,
          countryCode: a.countryCodeV2,
          firstName: a.firstName,
          lastName: a.lastName,
          phone: a.phone,
          provinceCode: a.provinceCode,
          zip: a.zip
        })
      ),
      emailMarketingConsent: customer.emailMarketingConsent?.marketingState
        ? compact({
            marketingState: customer.emailMarketingConsent.marketingState,
            marketingOptInLevel: customer.emailMarketingConsent.marketingOptInLevel,
            consentUpdatedAt: customer.emailMarketingConsent.consentUpdatedAt
          })
        : undefined,
      metafields: metafieldInputs(ctx, customer.metafields?.nodes, { kind: 'customer', handle: customer.email })
    });

    try {
      const pruned = await ctx.compat.prune('CustomerInput', input);
      if (customer.email && !pruned.email && !emailFieldWarned) {
        emailFieldWarned = true;
        warn("CustomerInput n'accepte plus le champ « email » sur cette version d'API : import clients à revoir.");
      }
      const payload = await ctx.dst.mutate(M_CUSTOMER_CREATE, { input: pruned }, 'customerCreate');
      if (payload?.customer) ctx.maps.set('customers', customer.id, payload.customer.id);
      created += 1;
      if (email) existingEmails.add(email);
    } catch (err) {
      fail(`client ${customer.email || customer.phone} : ${err.message}`);
    }
    progress((done += 1), source.length, 'clients');
    if (done % 25 === 0) await ctx.maps.save();
  }
  await ctx.maps.save();
  ok(`${created} client(s) créé(s), ${skipped} ignoré(s) (déjà présents ou sans e-mail ni téléphone).`);
  info('Les mots de passe clients ne se migrent pas : les clients devront en définir un nouveau.');
  return { created, skipped, total: source.length };
}

export async function run(ctx) {
  step('8. Politiques, redirections, expédition, langues, métachamps de boutique et clients');

  const policies = await copyPolicies(ctx);
  const redirects = await copyRedirects(ctx);
  const shipping = await copyShipping(ctx);
  const locales = await copyLocales(ctx);
  const shopMetafields = await copyShopMetafields(ctx);
  const customers = await copyCustomers(ctx);

  const markets = (await ctx.source.tryGet('markets')) || [];
  if (markets.length > 1) {
    warn(
      `${markets.length} marchés détectés sur la source (${markets.map((m) => m.name).join(', ')}) : ` +
        `les marchés se configurent à la main (Paramètres > Marchés).`
    );
  }

  ctx.report.settings = { policies, redirects, shipping, locales, shopMetafields, customers, markets: markets.length };
}
