import { detail, fail, info, ok, progress, step, warn } from '../log.js';
import { baseFileName, chunk, cleanCdnUrl, compact, fileNameFromUrl, isReservedNamespace } from '../util.js';

const M_PRODUCT_SET = `
mutation ProductSet($input: ProductSetInput!) {
  productSet(input: $input, synchronous: true) {
    product {
      id handle
      media(first: 100) { nodes { id alt ... on MediaImage { image { url } } } }
      variants(first: 100) {
        nodes {
          id sku
          selectedOptions { name value }
          inventoryItem { id inventoryLevels(first: 20) { nodes { location { id } } } }
        }
      }
    }
    productSetOperation { id status }
    userErrors { field message code }
  }
}`;

const Q_DEST_PRODUCTS = `
query DestProducts($pageSize: Int!, $cursor: String) {
  products(first: $pageSize, after: $cursor, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle
      media(first: 100) { nodes { id ... on MediaImage { image { url } } } }
      variants(first: 100) {
        nodes {
          id sku
          selectedOptions { name value }
          inventoryItem { id inventoryLevels(first: 20) { nodes { location { id } } } }
        }
      }
    }
  }
}`;

const M_INVENTORY_ACTIVATE = `
mutation InventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
  inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
    inventoryLevel { id }
    userErrors { field message }
  }
}`;

const M_INVENTORY_SET = `
mutation InventorySet($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup { createdAt reason }
    userErrors { field message code }
  }
}`;

export const M_PUBLISH = `
mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) {
    userErrors { field message }
  }
}`;

const Q_DEST_LOCATIONS = `
query DestLocations($pageSize: Int!, $cursor: String) {
  locations(first: $pageSize, after: $cursor, includeInactive: false) {
    pageInfo { hasNextPage endCursor }
    nodes { id name isActive fulfillsOnlineOrders }
  }
}`;

const Q_DEST_PUBLICATIONS = `
query DestPublications($pageSize: Int!, $cursor: String) {
  publications(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { id name }
  }
}`;

export const variantKey = (variant) =>
  variant.sku?.trim()
    ? `sku:${variant.sku.trim()}`
    : `opt:${(variant.selectedOptions || []).map((o) => `${o.name}=${o.value}`).join('|')}`;

/** Métachamps utilisables : on écarte les namespaces réservés et on remappe les références. */
export function metafieldInputs(ctx, metafields, context) {
  const out = [];
  for (const mf of metafields || []) {
    if (isReservedNamespace(mf.namespace)) continue;
    const { value, resolved } = ctx.maps.remapValue(mf.value);
    if (!resolved) ctx.maps.noteUnresolved({ ...context, namespace: mf.namespace, key: mf.key, value: mf.value });
    out.push({ namespace: mf.namespace, key: mf.key, type: mf.type, value });
  }
  return out;
}

/** Correspondance emplacement source -> emplacement destination (par nom, sinon principal). */
export async function locationMapping(ctx) {
  const [srcLocations, dstLocations] = await Promise.all([
    ctx.source.tryGet('locations'),
    ctx.dst.collect(Q_DEST_LOCATIONS, {}, (d) => d.locations, { pageSize: 50 })
  ]);
  if (!dstLocations.length) throw new Error("La destination n'a aucun emplacement actif.");
  const primary = dstLocations.find((l) => l.fulfillsOnlineOrders) || dstLocations[0];
  const byName = new Map(dstLocations.map((l) => [l.name.trim().toLowerCase(), l]));
  const mapping = new Map();
  for (const loc of srcLocations || []) {
    const match = byName.get(loc.name.trim().toLowerCase()) || primary;
    mapping.set(loc.id, match.id);
    ctx.maps.set('locations', loc.id, match.id);
    if (match === primary && !byName.has(loc.name.trim().toLowerCase())) {
      detail(`emplacement « ${loc.name} » sans équivalent : stock reporté sur « ${primary.name} »`);
    }
  }
  return { mapping, primary, dstLocations };
}

/** Correspondance canal de vente source -> destination (par nom). */
export async function publicationMapping(ctx) {
  const dst = await ctx.dst.collect(Q_DEST_PUBLICATIONS, {}, (d) => d.publications, { pageSize: 50 });
  const byName = new Map(dst.map((p) => [p.name.trim().toLowerCase(), p.id]));
  const onlineStore = byName.get('online store') || byName.get('boutique en ligne') || dst[0]?.id || null;
  return { byName, onlineStore, all: dst };
}

/** Publie une ressource sur les mêmes canaux que la source. */
export async function publishLike(ctx, destId, resourcePublications, pubMap) {
  const targets = [];
  for (const rp of resourcePublications?.nodes || []) {
    if (!rp.isPublished) continue;
    const id = pubMap.byName.get(rp.publication?.name?.trim().toLowerCase());
    if (id) targets.push({ publicationId: id });
  }
  if (!targets.length) return false;
  try {
    await ctx.dst.mutate(M_PUBLISH, { id: destId, input: targets }, 'publishablePublish');
    return true;
  } catch (err) {
    if (/already published/i.test(err.message)) return true;
    detail(`publication impossible pour ${destId} : ${err.message}`);
    return false;
  }
}

function fileSetInput(url, alt, destMediaByName) {
  const name = baseFileName(url);
  const existing = name ? destMediaByName.get(name) : null;
  if (existing) return { id: existing };
  return compact({
    originalSource: cleanCdnUrl(url),
    filename: fileNameFromUrl(url),
    alt: alt || undefined,
    contentType: 'IMAGE'
  });
}

function mediaUrl(media) {
  return media.image?.url || media.originalSource?.url || media.originUrl || null;
}

export async function run(ctx) {
  step('4. Produits, stock et publications');

  const products = await ctx.source.get('products');
  const { mapping: locMap, primary } = await locationMapping(ctx);
  const pubMap = await publicationMapping(ctx);

  const destProducts = await ctx.dst.collect(Q_DEST_PRODUCTS, {}, (d) => d.products, { pageSize: 10 });
  const destByHandle = new Map(destProducts.map((p) => [p.handle, p]));
  info(`${products.length} produit(s) source · ${destProducts.length} déjà présent(s) sur la destination`);

  let created = 0;
  let updated = 0;
  let published = 0;
  const inventoryOps = [];
  const activations = [];

  for (const [index, product] of products.entries()) {
    const existing = destByHandle.get(product.handle);
    const destMediaByName = new Map();
    for (const media of existing?.media?.nodes || []) {
      const name = baseFileName(media.image?.url);
      if (name) destMediaByName.set(name, media.id);
    }
    const destVariantsByKey = new Map((existing?.variants?.nodes || []).map((v) => [variantKey(v), v]));

    const files = [];
    for (const media of product.media?.nodes || []) {
      const url = mediaUrl(media);
      if (!url) {
        if (media.mediaContentType === 'EXTERNAL_VIDEO') detail(`vidéo externe non reprise pour ${product.handle}`);
        continue;
      }
      files.push(fileSetInput(url, media.alt, destMediaByName));
    }

    const variants = (product.variants?.nodes || []).map((variant) => {
      const key = variantKey(variant);
      const destVariant = destVariantsByKey.get(key);
      const variantImage = variant.media?.nodes?.[0]?.image?.url;
      return compact({
        id: destVariant?.id,
        optionValues: (variant.selectedOptions || []).map((o) => ({ optionName: o.name, name: o.value })),
        price: variant.price,
        compareAtPrice: variant.compareAtPrice,
        sku: variant.sku || undefined,
        barcode: variant.barcode || undefined,
        taxable: variant.taxable,
        taxCode: variant.taxCode || undefined,
        inventoryPolicy: variant.inventoryPolicy,
        position: variant.position,
        file: variantImage ? fileSetInput(variantImage, null, destMediaByName) : undefined,
        inventoryItem: compact({
          sku: variant.inventoryItem?.sku || undefined,
          tracked: variant.inventoryItem?.tracked,
          requiresShipping: variant.inventoryItem?.requiresShipping,
          countryCodeOfOrigin: variant.inventoryItem?.countryCodeOfOrigin || undefined,
          provinceCodeOfOrigin: variant.inventoryItem?.provinceCodeOfOrigin || undefined,
          harmonizedSystemCode: variant.inventoryItem?.harmonizedSystemCode || undefined,
          cost: variant.inventoryItem?.unitCost?.amount || undefined,
          measurement: variant.inventoryItem?.measurement?.weight
            ? { weight: { unit: variant.inventoryItem.measurement.weight.unit, value: variant.inventoryItem.measurement.weight.value } }
            : undefined
        }),
        metafields: metafieldInputs(ctx, variant.metafields?.nodes, { kind: 'variant', handle: product.handle, variant: key, srcId: variant.id })
      });
    });

    const input = compact({
      id: existing?.id,
      handle: product.handle,
      title: product.title,
      descriptionHtml: ctx.rewrite(product.descriptionHtml),
      vendor: product.vendor,
      productType: product.productType,
      tags: product.tags,
      status: product.status,
      templateSuffix: product.templateSuffix || undefined,
      requiresSellingPlan: product.requiresSellingPlan,
      giftCard: product.isGiftCard,
      category: product.category?.id,
      seo: compact({ title: product.seo?.title, description: product.seo?.description }),
      productOptions: (product.options || []).map((o) =>
        compact({
          name: o.name,
          position: o.position,
          values: (o.optionValues || []).map((v) =>
            compact({
              name: v.name,
              swatch: v.swatch ? compact({ color: v.swatch.color, mediaId: undefined }) : undefined
            })
          )
        })
      ),
      files,
      variants,
      metafields: metafieldInputs(ctx, product.metafields?.nodes, { kind: 'product', handle: product.handle, srcId: product.id })
    });

    try {
      const pruned = await ctx.compat.prune('ProductSetInput', input);
      const payload = await ctx.dst.mutate(M_PRODUCT_SET, { input: pruned }, 'productSet');
      const destProduct = payload?.product;
      if (!destProduct) {
        if (payload?.productSetOperation) warn(`productSet asynchrone pour ${product.handle} (opération ${payload.productSetOperation.id})`);
        else if (!ctx.config.dryRun) fail(`productSet sans produit renvoyé pour ${product.handle}`);
      } else {
        ctx.maps.set('products', product.id, destProduct.id);
        if (existing) updated += 1;
        else created += 1;

        const destVariants = new Map((destProduct.variants?.nodes || []).map((v) => [variantKey(v), v]));
        for (const variant of product.variants?.nodes || []) {
          const dv = destVariants.get(variantKey(variant));
          if (!dv) {
            detail(`variante non retrouvée après création : ${product.handle} / ${variantKey(variant)}`);
            continue;
          }
          ctx.maps.set('variants', variant.id, dv.id);
          if (!variant.inventoryItem?.tracked) continue;
          const activated = new Set((dv.inventoryItem?.inventoryLevels?.nodes || []).map((n) => n.location.id));
          const perLocation = new Map();
          for (const level of variant.inventoryItem?.inventoryLevels?.nodes || []) {
            const destLocation = locMap.get(level.location.id) || primary.id;
            const qty = level.quantities?.find((q) => q.name === 'available')?.quantity || 0;
            perLocation.set(destLocation, (perLocation.get(destLocation) || 0) + qty);
          }
          for (const [locationId, quantity] of perLocation) {
            if (!activated.has(locationId)) activations.push({ inventoryItemId: dv.inventoryItem.id, locationId });
            inventoryOps.push({ inventoryItemId: dv.inventoryItem.id, locationId, quantity });
          }
        }

        if (await publishLike(ctx, destProduct.id, product.resourcePublications, pubMap)) published += 1;
      }
    } catch (err) {
      fail(`produit ${product.handle} : ${err.message}`);
    }

    progress(index + 1, products.length, 'produits');
    if ((index + 1) % 10 === 0) await ctx.maps.save();
  }
  await ctx.maps.save();
  ok(`${created} produit(s) créé(s), ${updated} mis à jour, ${published} publié(s).`);

  // --- Stock ---
  if (activations.length) {
    info(`Activation du suivi de stock sur ${activations.length} couple(s) article/emplacement…`);
    let done = 0;
    for (const activation of activations) {
      try {
        await ctx.dst.mutate(M_INVENTORY_ACTIVATE, activation, 'inventoryActivate');
      } catch (err) {
        detail(`activation impossible (${activation.inventoryItemId}) : ${err.message}`);
      }
      progress((done += 1), activations.length, 'activations');
    }
  }

  if (inventoryOps.length) {
    let applied = 0;
    for (const batch of chunk(inventoryOps, 200)) {
      try {
        await ctx.dst.mutate(
          M_INVENTORY_SET,
          {
            input: {
              name: 'available',
              reason: 'correction',
              ignoreCompareQuantity: true,
              quantities: batch
            }
          },
          'inventorySetQuantities'
        );
        applied += batch.length;
      } catch (err) {
        fail(`stock (lot de ${batch.length}) : ${err.message}`);
      }
      progress(applied, inventoryOps.length, 'stock');
    }
    ok(`Stock appliqué sur ${applied} couple(s) variante/emplacement.`);
  }

  ctx.report.products = {
    source: products.length,
    created,
    updated,
    published,
    inventoryEntries: inventoryOps.length
  };
}
