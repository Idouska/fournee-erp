import { exportPath, isGid, readJson, writeJson } from './util.js';

const MAP_FILE = () => exportPath('map.json');

const EMPTY = {
  files: {},        // gid fichier source -> gid fichier destination
  fileNames: {},    // nom de fichier -> gid destination
  fileUrls: {},     // nom de fichier -> URL CDN destination
  products: {},
  variants: {},
  collections: {},
  pages: {},
  blogs: {},
  articles: {},
  metaobjects: {},
  customers: {},
  locations: {},
  publications: {},
  unresolved: []    // références non résolues au moment de l'écriture
};

/** Table de correspondance GID source -> GID destination, persistée dans ./export/map.json */
export class IdMaps {
  constructor(data = {}) {
    this.data = { ...structuredClone(EMPTY), ...data };
  }

  static async load() {
    const data = await readJson(MAP_FILE(), null);
    return new IdMaps(data || {});
  }

  async save() {
    await writeJson(MAP_FILE(), this.data);
  }

  bucket(name) {
    if (!this.data[name]) this.data[name] = {};
    return this.data[name];
  }

  set(bucket, srcId, dstId) {
    if (!srcId || !dstId) return;
    this.bucket(bucket)[srcId] = dstId;
  }

  get(bucket, srcId) {
    return this.bucket(bucket)[srcId] || null;
  }

  /** Traduit un GID source en GID destination, tous types confondus. */
  remapGid(gid) {
    if (!isGid(gid)) return null;
    for (const name of ['products', 'variants', 'collections', 'pages', 'blogs', 'articles', 'files', 'metaobjects', 'customers', 'locations']) {
      const found = this.bucket(name)[gid];
      if (found) return found;
    }
    return null;
  }

  /**
   * Traduit une valeur de métachamp/métaobjet contenant des références.
   * Gère un GID seul ou une liste JSON de GIDs.
   * @returns {{value: string, resolved: boolean}}
   */
  remapValue(value) {
    if (typeof value !== 'string') return { value, resolved: true };
    if (isGid(value)) {
      const mapped = this.remapGid(value);
      return mapped ? { value: mapped, resolved: true } : { value, resolved: false };
    }
    if (value.trim().startsWith('[')) {
      let list;
      try {
        list = JSON.parse(value);
      } catch {
        return { value, resolved: true };
      }
      if (!Array.isArray(list) || !list.every((v) => isGid(v))) return { value, resolved: true };
      let resolved = true;
      const mapped = list.map((v) => {
        const m = this.remapGid(v);
        if (!m) resolved = false;
        return m || v;
      });
      return { value: JSON.stringify(mapped), resolved };
    }
    return { value, resolved: true };
  }

  noteUnresolved(entry) {
    this.data.unresolved.push(entry);
  }
}
