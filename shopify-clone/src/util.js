import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function unique(list) {
  return [...new Set(list)];
}

/** Nom de fichier d'une URL CDN Shopify, sans les paramètres de version. */
export function fileNameFromUrl(url) {
  if (!url) return null;
  try {
    const path = new URL(url).pathname;
    const base = decodeURIComponent(path.split('/').pop() || '');
    return base || null;
  } catch {
    return null;
  }
}

/** Nom de fichier sans le suffixe de taille ajouté par le CDN (_1024x1024). */
export function baseFileName(url) {
  const name = fileNameFromUrl(url);
  if (!name) return null;
  return name.replace(/_(\d+x\d*|x\d+)(_crop_[a-z]+)?(?=\.[a-z0-9]+$)/i, '');
}

/** URL CDN sans paramètres (?v=…) pour un import stable côté destination. */
export function cleanCdnUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.search = '';
    return u.toString();
  } catch {
    return url;
  }
}

export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function exportPath(...parts) {
  return resolve(process.cwd(), 'export', ...parts);
}

/**
 * Réécrit les liens absolus vers la boutique source en liens relatifs.
 * Couvre le domaine myshopify.com source et le domaine public éventuel.
 */
export function rewriteLinks(text, domains) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const domain of domains.filter(Boolean)) {
    const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`https?://(www\\.)?${escaped}`, 'gi'), '');
  }
  return out;
}

export function isGid(value) {
  return typeof value === 'string' && value.startsWith('gid://shopify/');
}

export function gidType(gid) {
  if (!isGid(gid)) return null;
  return gid.split('/')[3] || null;
}

export function truncate(text, max = 120) {
  if (typeof text !== 'string') return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

/** Retire récursivement les valeurs null/undefined d'un objet destiné à l'API. */
export function compact(value) {
  if (Array.isArray(value)) return value.map((v) => compact(v)).filter((v) => v !== undefined && v !== null);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || v === null) continue;
      const cleaned = compact(v);
      if (cleaned === undefined) continue;
      if (typeof cleaned === 'object' && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0) continue;
      out[k] = cleaned;
    }
    return out;
  }
  return value;
}

/** Namespaces réservés par Shopify ou par une app : non recréables. */
export function isReservedNamespace(namespace = '') {
  return namespace.startsWith('shopify--') || namespace === 'shopify' || namespace.startsWith('app--');
}

export function isReservedType(type = '') {
  return type.startsWith('shopify--') || type.startsWith('app--');
}
