import { detail, fail, info, ok, progress, step, warn } from '../log.js';
import { compact, isReservedNamespace, isReservedType } from '../util.js';

const M_DEF_CREATE = `
mutation MetafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) {
    createdDefinition { id namespace key ownerType }
    userErrors { field message code }
  }
}`;

const M_MO_DEF_CREATE = `
mutation MetaobjectDefinitionCreate($definition: MetaobjectDefinitionCreateInput!) {
  metaobjectDefinitionCreate(definition: $definition) {
    metaobjectDefinition { id type }
    userErrors { field message code }
  }
}`;

const M_MO_CREATE = `
mutation MetaobjectCreate($metaobject: MetaobjectCreateInput!) {
  metaobjectCreate(metaobject: $metaobject) {
    metaobject { id type handle }
    userErrors { field message code }
  }
}`;

export const M_MO_UPDATE = `
mutation MetaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
  metaobjectUpdate(id: $id, metaobject: $metaobject) {
    metaobject { id handle }
    userErrors { field message code }
  }
}`;

const Q_DEST_DEFS = `
query DestDefs($ownerType: MetafieldOwnerType!, $pageSize: Int!, $cursor: String) {
  metafieldDefinitions(first: $pageSize, after: $cursor, ownerType: $ownerType) {
    pageInfo { hasNextPage endCursor }
    nodes { id namespace key ownerType }
  }
}`;

const Q_DEST_MO_DEFS = `
query DestMoDefs($pageSize: Int!, $cursor: String) {
  metaobjectDefinitions(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { id type }
  }
}`;

export const Q_DEST_METAOBJECTS = `
query DestMetaobjects($type: String!, $pageSize: Int!, $cursor: String) {
  metaobjects(type: $type, first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { id type handle fields { key value } }
  }
}`;

function definitionInput(def) {
  return compact({
    name: def.name,
    namespace: def.namespace,
    key: def.key,
    description: def.description,
    type: def.type?.name,
    ownerType: def.ownerType,
    pin: def.pinnedPosition !== null && def.pinnedPosition !== undefined,
    validations: (def.validations || []).map((v) => ({ name: v.name, value: v.value })),
    access: def.access ? { admin: def.access.admin, storefront: def.access.storefront, customerAccount: def.access.customerAccount } : undefined,
    capabilities: compact({
      adminFilterable: def.capabilities?.adminFilterable?.enabled ? { enabled: true } : undefined,
      smartCollectionCondition: def.capabilities?.smartCollectionCondition?.enabled ? { enabled: true } : undefined
    })
  });
}

function metaobjectDefinitionInput(def) {
  return compact({
    type: def.type,
    name: def.name,
    description: def.description,
    displayNameKey: def.displayNameKey,
    access: def.access ? { admin: def.access.admin, storefront: def.access.storefront } : undefined,
    capabilities: compact({
      publishable: def.capabilities?.publishable?.enabled ? { enabled: true } : undefined,
      translatable: def.capabilities?.translatable?.enabled ? { enabled: true } : undefined,
      renderable: def.capabilities?.renderable?.enabled
        ? { enabled: true, data: compact(def.capabilities.renderable.data || {}) }
        : undefined,
      onlineStore: def.capabilities?.onlineStore?.enabled
        ? { enabled: true, data: compact(def.capabilities.onlineStore.data || {}) }
        : undefined
    }),
    fieldDefinitions: (def.fieldDefinitions || []).map((f) =>
      compact({
        key: f.key,
        name: f.name,
        description: f.description,
        required: f.required,
        type: f.type?.name,
        validations: (f.validations || []).map((v) => ({ name: v.name, value: v.value }))
      })
    )
  });
}

/** Remappe les valeurs de champs qui référencent des ressources (fichiers, produits…). */
export function remapFields(ctx, fields, context) {
  const out = [];
  let unresolved = 0;
  for (const field of fields) {
    if (field.value === null || field.value === undefined) continue;
    const { value, resolved } = ctx.maps.remapValue(field.value);
    if (!resolved) {
      unresolved += 1;
      ctx.maps.noteUnresolved({ ...context, key: field.key, value: field.value });
    }
    out.push({ key: field.key, value });
  }
  return { fields: out, unresolved };
}

export async function run(ctx) {
  step('3. Définitions de métachamps, définitions de métaobjets et métaobjets');

  // --- Définitions de métachamps ---
  const defs = (await ctx.source.tryGet('metafieldDefinitions')) || [];
  const usable = defs.filter((d) => !isReservedNamespace(d.namespace));
  const reserved = defs.length - usable.length;

  const ownerTypes = [...new Set(usable.map((d) => d.ownerType))];
  const existing = new Set();
  for (const ownerType of ownerTypes) {
    try {
      const nodes = await ctx.dst.collect(Q_DEST_DEFS, { ownerType }, (d) => d.metafieldDefinitions, { pageSize: 100 });
      for (const n of nodes) existing.add(`${n.ownerType}|${n.namespace}|${n.key}`);
    } catch (err) {
      detail(`définitions destination ${ownerType} illisibles : ${err.message}`);
    }
  }

  let createdDefs = 0;
  let doneDefs = 0;
  for (const def of usable) {
    const key = `${def.ownerType}|${def.namespace}|${def.key}`;
    if (!existing.has(key)) {
      try {
        const input = await ctx.compat.prune('MetafieldDefinitionInput', definitionInput(def));
        await ctx.dst.mutate(M_DEF_CREATE, { definition: input }, 'metafieldDefinitionCreate');
        createdDefs += 1;
      } catch (err) {
        if (/taken|already exists/i.test(err.message)) detail(`définition déjà présente : ${key}`);
        else fail(`définition ${key} : ${err.message}`);
      }
    }
    doneDefs += 1;
    progress(doneDefs, usable.length, 'définitions');
  }
  ok(`${createdDefs} définition(s) de métachamps créée(s) sur ${usable.length}${reserved ? ` (${reserved} réservée(s) shopify--/app-- ignorée(s))` : ''}.`);

  // --- Définitions de métaobjets ---
  const moDefs = ((await ctx.source.tryGet('metaobjectDefinitions')) || []).filter((d) => !isReservedType(d.type));
  const destMoDefs = await ctx.dst.collect(Q_DEST_MO_DEFS, {}, (d) => d.metaobjectDefinitions, { pageSize: 100 });
  const destMoTypes = new Set(destMoDefs.map((d) => d.type));

  let createdMoDefs = 0;
  for (const def of moDefs) {
    if (destMoTypes.has(def.type)) continue;
    try {
      const input = await ctx.compat.prune('MetaobjectDefinitionCreateInput', metaobjectDefinitionInput(def));
      await ctx.dst.mutate(M_MO_DEF_CREATE, { definition: input }, 'metaobjectDefinitionCreate');
      createdMoDefs += 1;
      destMoTypes.add(def.type);
    } catch (err) {
      fail(`définition de métaobjet ${def.type} : ${err.message}`);
    }
  }
  ok(`${createdMoDefs} définition(s) de métaobjets créée(s) sur ${moDefs.length}.`);

  // --- Métaobjets ---
  const metaobjects = ((await ctx.source.tryGet('metaobjects')) || []).filter((m) => !isReservedType(m.type));
  const destByType = new Map();
  for (const type of new Set(metaobjects.map((m) => m.type))) {
    if (!destMoTypes.has(type)) continue;
    try {
      const nodes = await ctx.dst.collect(Q_DEST_METAOBJECTS, { type }, (d) => d.metaobjects, { pageSize: 100 });
      destByType.set(type, new Map(nodes.map((n) => [n.handle, n])));
    } catch (err) {
      detail(`métaobjets destination ${type} illisibles : ${err.message}`);
    }
  }

  let createdMo = 0;
  let updatedMo = 0;
  let unresolvedTotal = 0;
  let doneMo = 0;
  for (const mo of metaobjects) {
    const { fields, unresolved } = remapFields(ctx, mo.fields || [], { kind: 'metaobject', type: mo.type, handle: mo.handle, srcId: mo.id });
    unresolvedTotal += unresolved;
    const existingMo = destByType.get(mo.type)?.get(mo.handle);
    try {
      if (existingMo) {
        const input = await ctx.compat.prune(
          'MetaobjectUpdateInput',
          compact({ fields, capabilities: mo.capabilities?.publishable ? { publishable: { status: mo.capabilities.publishable.status } } : undefined })
        );
        await ctx.dst.mutate(M_MO_UPDATE, { id: existingMo.id, metaobject: input }, 'metaobjectUpdate');
        ctx.maps.set('metaobjects', mo.id, existingMo.id);
        updatedMo += 1;
      } else {
        const input = await ctx.compat.prune(
          'MetaobjectCreateInput',
          compact({
            type: mo.type,
            handle: mo.handle,
            fields,
            capabilities: mo.capabilities?.publishable ? { publishable: { status: mo.capabilities.publishable.status } } : undefined
          })
        );
        const payload = await ctx.dst.mutate(M_MO_CREATE, { metaobject: input }, 'metaobjectCreate');
        if (payload?.metaobject) ctx.maps.set('metaobjects', mo.id, payload.metaobject.id);
        createdMo += 1;
      }
    } catch (err) {
      fail(`métaobjet ${mo.type}/${mo.handle} : ${err.message}`);
    }
    doneMo += 1;
    progress(doneMo, metaobjects.length, 'métaobjets');
    if (doneMo % 25 === 0) await ctx.maps.save();
  }
  await ctx.maps.save();
  ok(`${createdMo} métaobjet(s) créé(s), ${updatedMo} mis à jour.`);
  if (unresolvedTotal) {
    info(`${unresolvedTotal} référence(s) encore inconnues (produits/collections non encore créés) — reprises à l'étape « relink ».`);
  }

  ctx.report.metafields = {
    definitions: { source: defs.length, reserved, created: createdDefs },
    metaobjectDefinitions: { source: moDefs.length, created: createdMoDefs },
    metaobjects: { source: metaobjects.length, created: createdMo, updated: updatedMo, unresolved: unresolvedTotal }
  };
}
