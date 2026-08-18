import { detail, warn } from './log.js';

const Q_INPUT_TYPE = `
query IntrospectType($name: String!) {
  __type(name: $name) {
    kind
    name
    inputFields {
      name
      type { ...Ref }
    }
  }
}
fragment Ref on __Type {
  kind name
  ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
}`;

const Q_MUTATIONS = `
query MutationFields {
  __schema { mutationType { fields { name } } }
}`;

function namedType(ref) {
  let cur = ref;
  while (cur && !cur.name) cur = cur.ofType;
  return cur?.name || null;
}

/**
 * Introspection légère du schéma de la boutique destination.
 * Sert à retirer d'une variable les champs absents de la version d'API utilisée
 * (les schémas Shopify bougent d'une version à l'autre) plutôt que de faire
 * échouer toute l'étape sur un champ inconnu.
 */
export class SchemaCompat {
  constructor(client) {
    this.client = client;
    this.types = new Map();
    this.mutations = null;
    this.dropped = new Set();
  }

  async #inputType(name) {
    if (this.types.has(name)) return this.types.get(name);
    let result = null;
    try {
      const data = await this.client.request(Q_INPUT_TYPE, { name });
      const type = data?.__type;
      if (type?.inputFields) {
        result = new Map(type.inputFields.map((f) => [f.name, namedType(f.type)]));
      }
    } catch {
      result = null;
    }
    this.types.set(name, result);
    return result;
  }

  async hasMutation(name) {
    if (!this.mutations) {
      try {
        const data = await this.client.request(Q_MUTATIONS);
        this.mutations = new Set((data?.__schema?.mutationType?.fields || []).map((f) => f.name));
      } catch {
        this.mutations = new Set();
      }
    }
    return this.mutations.size === 0 ? true : this.mutations.has(name);
  }

  /** Retire récursivement les clés absentes du type d'entrée `typeName`. */
  async prune(typeName, value) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      const out = [];
      for (const item of value) out.push(await this.prune(typeName, item));
      return out;
    }
    if (typeof value !== 'object') return value;
    const fields = await this.#inputType(typeName);
    if (!fields) return value;
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (!fields.has(key)) {
        const tag = `${typeName}.${key}`;
        if (!this.dropped.has(tag)) {
          this.dropped.add(tag);
          detail(`champ ignoré (absent de l'API ${this.client.apiVersion}) : ${tag}`);
        }
        continue;
      }
      const child = fields.get(key);
      out[key] = child ? await this.prune(child, val) : val;
    }
    return out;
  }

  report() {
    if (this.dropped.size) {
      warn(`${this.dropped.size} champ(s) ignoré(s) car absents de l'API ${this.client.apiVersion} : ${[...this.dropped].join(', ')}`);
    }
  }
}
