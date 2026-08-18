import * as Q from './queries.js';
import { exportPath, readJson, writeJson } from './util.js';
import { detail, warn } from './log.js';

/**
 * Chargeurs de données source. Chaque entrée est écrite dans ./export/<nom>.json
 * et relue telle quelle lors des exécutions suivantes (chaque étape est donc
 * lançable seule sans refaire tout l'export).
 */
export const LOADERS = {
  shop: async (c) => (await c.request(Q.Q_SHOP)).shop,
  counts: async (c) => c.request(Q.Q_COUNTS),
  locations: (c) => c.collect(Q.Q_LOCATIONS, {}, (d) => d.locations, { pageSize: 50 }),
  publications: (c) => c.collect(Q.Q_PUBLICATIONS, {}, (d) => d.publications, { pageSize: 50 }),
  products: (c, { limit } = {}) => c.collect(Q.Q_PRODUCTS, {}, (d) => d.products, { pageSize: 10, limit }),
  collections: (c, { limit } = {}) => c.collect(Q.Q_COLLECTIONS, {}, (d) => d.collections, { pageSize: 10, limit }),
  pages: (c, { limit } = {}) => c.collect(Q.Q_PAGES, {}, (d) => d.pages, { pageSize: 25, limit }),
  blogs: (c) => c.collect(Q.Q_BLOGS, {}, (d) => d.blogs, { pageSize: 25 }),
  articles: (c, { limit } = {}) => c.collect(Q.Q_ARTICLES, {}, (d) => d.articles, { pageSize: 15, limit }),
  menus: (c) => c.collect(Q.Q_MENUS, {}, (d) => d.menus, { pageSize: 25 }),
  files: (c, { limit } = {}) => c.collect(Q.Q_FILES, {}, (d) => d.files, { pageSize: 50, limit }),
  redirects: (c) => c.collect(Q.Q_URL_REDIRECTS, {}, (d) => d.urlRedirects, { pageSize: 250 }),
  policies: async (c) => (await c.request(Q.Q_SHOP_POLICIES)).shop.shopPolicies,
  deliveryProfiles: (c) => c.collect(Q.Q_DELIVERY_PROFILES, {}, (d) => d.deliveryProfiles, { pageSize: 5 }),
  markets: (c) => c.collect(Q.Q_MARKETS, {}, (d) => d.markets, { pageSize: 25 }),
  locales: async (c) => (await c.request(Q.Q_SHOP_LOCALES)).shopLocales,
  customers: (c, { limit } = {}) => c.collect(Q.Q_CUSTOMERS, {}, (d) => d.customers, { pageSize: 25, limit }),
  metafieldDefinitions: async (c) => {
    const out = [];
    for (const ownerType of Q.METAFIELD_OWNER_TYPES) {
      try {
        const defs = await c.collect(Q.Q_METAFIELD_DEFINITIONS, { ownerType }, (d) => d.metafieldDefinitions, { pageSize: 50 });
        out.push(...defs);
      } catch (err) {
        detail(`définitions ${ownerType} non lisibles : ${err.message}`);
      }
    }
    return out;
  },
  metaobjectDefinitions: (c) => c.collect(Q.Q_METAOBJECT_DEFINITIONS, {}, (d) => d.metaobjectDefinitions, { pageSize: 25 }),
  metaobjects: async (c, { definitions } = {}) => {
    const defs = definitions || (await LOADERS.metaobjectDefinitions(c));
    const out = [];
    for (const def of defs) {
      const items = await c.collect(Q.Q_METAOBJECTS, { type: def.type }, (d) => d.metaobjects, { pageSize: 50 });
      out.push(...items);
    }
    return out;
  }
};

/** Cache mémoire + disque des données source. */
export class SourceData {
  constructor(client, { limit = null, refresh = false } = {}) {
    this.client = client;
    this.limit = limit;
    this.refresh = refresh;
    this.cache = new Map();
  }

  async get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const file = exportPath(`${name}.json`);
    if (!this.refresh) {
      const cached = await readJson(file, null);
      if (cached !== null) {
        this.cache.set(name, cached);
        return cached;
      }
    }
    const loader = LOADERS[name];
    if (!loader) throw new Error(`Jeu de données inconnu : ${name}`);
    const extra = { limit: this.limit };
    if (name === 'metaobjects') extra.definitions = await this.get('metaobjectDefinitions');
    const data = await loader(this.client, extra);
    await writeJson(file, data);
    this.cache.set(name, data);
    return data;
  }

  /** Charge sans faire échouer l'étape si la ressource est inaccessible. */
  async tryGet(name, fallback = []) {
    try {
      return await this.get(name);
    } catch (err) {
      warn(`Lecture de « ${name} » impossible : ${err.message}`);
      return fallback;
    }
  }
}
