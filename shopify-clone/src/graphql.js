import { detail, warn } from './log.js';
import { sleep, truncate } from './util.js';
import { FALLBACK_API_VERSION } from './config.js';

const MAX_ATTEMPTS = 6;
/** Marge de points de coût gardée en réserve avant d'envoyer une requête. */
const COST_RESERVE = 250;

export class GraphQLError extends Error {
  constructor(message, { query, variables, errors, userErrors } = {}) {
    super(message);
    this.name = 'GraphQLError';
    this.query = query;
    this.variables = variables;
    this.errors = errors;
    this.userErrors = userErrors;
  }
}

export class ShopifyClient {
  /**
   * @param {{shop: string, token: string, label: string}} store
   * @param {{apiVersion?: string, readOnly?: boolean, dryRun?: boolean}} options
   */
  constructor(store, options = {}) {
    this.shop = store.shop;
    this.token = store.token;
    this.label = store.label;
    this.apiVersion = options.apiVersion || FALLBACK_API_VERSION;
    this.readOnly = options.readOnly === true;
    this.dryRun = options.dryRun === true;
    this.throttle = null;
    this.stats = { requests: 0, retries: 0, cost: 0 };
  }

  get endpoint() {
    return `https://${this.shop}/admin/api/${this.apiVersion}/graphql.json`;
  }

  /** Détecte la dernière version stable supportée par la boutique. */
  async detectApiVersion() {
    const res = await fetch(`https://${this.shop}/admin/api/unstable/graphql.json`, {
      method: 'POST',
      headers: this.#headers(),
      body: JSON.stringify({ query: '{ publicApiVersions { handle supported displayName } }' })
    });
    if (!res.ok) throw new Error(`Impossible de lister les versions d'API (${res.status})`);
    const body = await res.json();
    const versions = body?.data?.publicApiVersions || [];
    const stable = versions
      .filter((v) => v.supported && /^\d{4}-\d{2}$/.test(v.handle))
      .map((v) => v.handle)
      .sort();
    return stable.at(-1) || FALLBACK_API_VERSION;
  }

  #headers() {
    return {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': this.token,
      Accept: 'application/json',
      'User-Agent': 'shopify-store-clone/1.0'
    };
  }

  async #respectCostBudget(cost = 100) {
    if (!this.throttle) return;
    const needed = cost + COST_RESERVE;
    if (this.throttle.currentlyAvailable >= needed) return;
    const restoreRate = this.throttle.restoreRate || 50;
    const waitMs = Math.min(10_000, Math.ceil(((needed - this.throttle.currentlyAvailable) / restoreRate) * 1000));
    if (waitMs > 0) await sleep(waitMs);
  }

  /** Exécute une requête GraphQL avec gestion du bucket de coût et des retries. */
  async request(query, variables = {}, { estimatedCost = 100 } = {}) {
    const isMutation = /^\s*mutation\b/.test(query);
    if (isMutation && this.readOnly) {
      throw new Error(`Mutation refusée sur la boutique ${this.label} (lecture seule) : ${truncate(query, 80)}`);
    }
    if (isMutation && this.dryRun) {
      detail(`[dry-run] mutation ignorée sur ${this.label} : ${truncate(query.replace(/\s+/g, ' '), 90)}`);
      return { __dryRun: true };
    }

    let attempt = 0;
    let lastError = null;
    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      await this.#respectCostBudget(estimatedCost);
      let res;
      try {
        this.stats.requests += 1;
        res = await fetch(this.endpoint, {
          method: 'POST',
          headers: this.#headers(),
          body: JSON.stringify({ query, variables })
        });
      } catch (err) {
        // Domaine inexistant ou port fermé : inutile de réessayer.
        const code = err?.cause?.code || err?.code;
        if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'EAI_AGAIN') {
          throw new Error(`Boutique ${this.label} injoignable (${this.shop}) : ${code}`);
        }
        lastError = err;
        this.stats.retries += 1;
        await sleep(2 ** attempt * 500);
        continue;
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After') || 2);
        this.stats.retries += 1;
        await sleep(Math.max(1000, retryAfter * 1000));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        const text = await res.text();
        throw new Error(
          `Accès refusé sur ${this.label} (${res.status}). Jeton invalide ou droit manquant.\n${truncate(text, 300)}`
        );
      }
      if (res.status >= 500) {
        this.stats.retries += 1;
        await sleep(2 ** attempt * 500);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} sur ${this.label} : ${truncate(text, 300)}`);
      }

      const body = await res.json();
      const cost = body?.extensions?.cost;
      if (cost) {
        this.throttle = cost.throttleStatus;
        this.stats.cost += cost.actualQueryCost || 0;
      }

      const throttled = (body.errors || []).some((e) => e?.extensions?.code === 'THROTTLED');
      if (throttled) {
        this.stats.retries += 1;
        const restoreRate = this.throttle?.restoreRate || 50;
        const missing = (cost?.requestedQueryCost || 100) - (this.throttle?.currentlyAvailable || 0);
        await sleep(Math.min(15_000, Math.max(1000, Math.ceil((missing / restoreRate) * 1000))));
        continue;
      }

      if (body.errors?.length) {
        const message = body.errors.map((e) => e.message).join(' | ');
        // Erreurs transitoires côté Shopify
        if (/internal error|try again/i.test(message) && attempt < MAX_ATTEMPTS) {
          this.stats.retries += 1;
          await sleep(2 ** attempt * 500);
          continue;
        }
        throw new GraphQLError(`${this.label} : ${message}`, { query, variables, errors: body.errors });
      }
      return body.data;
    }
    throw new GraphQLError(
      `${this.label} : échec après ${MAX_ATTEMPTS} tentatives${lastError ? ` (${lastError.message})` : ''}`,
      { query, variables }
    );
  }

  /**
   * Exécute une mutation et lève une erreur si userErrors est non vide.
   * @returns {Promise<object|null>} le payload de la mutation
   */
  async mutate(query, variables, mutationName) {
    const data = await this.request(query, variables);
    if (data?.__dryRun) return null;
    const payload = data?.[mutationName];
    if (!payload) throw new GraphQLError(`Réponse vide pour ${mutationName}`, { query, variables });
    const userErrors = payload.userErrors || payload.mediaUserErrors || [];
    if (userErrors.length) {
      const message = userErrors
        .map((e) => `${(e.field || []).join('.') || '-'}: ${e.message}${e.code ? ` (${e.code})` : ''}`)
        .join(' | ');
      throw new GraphQLError(`${mutationName} → ${message}`, { query, variables, userErrors });
    }
    return payload;
  }

  /**
   * Parcourt une connexion paginée.
   * @param {string} query requête contenant $cursor
   * @param {(data:object)=>object} pick renvoie la connexion { nodes, pageInfo }
   */
  async *paginate(query, variables = {}, pick, { limit = null, pageSize = 50 } = {}) {
    let cursor = null;
    let count = 0;
    for (;;) {
      const data = await this.request(query, { ...variables, cursor, pageSize });
      const connection = pick(data);
      if (!connection) return;
      for (const node of connection.nodes || []) {
        yield node;
        count += 1;
        if (limit && count >= limit) return;
      }
      if (!connection.pageInfo?.hasNextPage) return;
      cursor = connection.pageInfo.endCursor;
    }
  }

  async collect(query, variables, pick, options) {
    const out = [];
    for await (const node of this.paginate(query, variables, pick, options)) out.push(node);
    return out;
  }
}
