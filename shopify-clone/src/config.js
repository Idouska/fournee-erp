import { warn } from './log.js';

/** Version utilisée si la détection automatique échoue. */
export const FALLBACK_API_VERSION = '2025-07';

export const ALL_STEPS = [
  'audit',
  'files',
  'metafields',
  'products',
  'collections',
  'content',
  'menus',
  'settings',
  'relink',
  'translations',
  'theme',
  'verify'
];

function normalizeShop(value) {
  if (!value) return value;
  return value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function parseArgs(argv) {
  const args = { steps: null, yes: false, dryRun: false, limit: null, skipTheme: false, resume: true };
  for (const raw of argv) {
    const [flag, value] = raw.includes('=') ? [raw.slice(0, raw.indexOf('=')), raw.slice(raw.indexOf('=') + 1)] : [raw, null];
    switch (flag) {
      case '--steps':
        args.steps = value.split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--only':
        args.steps = value.split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--skip':
        args.skip = value.split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--yes':
      case '-y':
        args.yes = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--limit':
        args.limit = Number(value);
        break;
      case '--skip-theme':
        args.skipTheme = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (flag.startsWith('-')) warn(`Option inconnue ignorée : ${flag}`);
    }
  }
  if (args.steps) {
    const unknown = args.steps.filter((s) => !ALL_STEPS.includes(s));
    if (unknown.length) throw new Error(`Étapes inconnues : ${unknown.join(', ')}. Disponibles : ${ALL_STEPS.join(', ')}`);
  }
  if (args.skip) {
    const base = args.steps || ALL_STEPS;
    args.steps = base.filter((s) => !args.skip.includes(s));
  }
  return args;
}

export function loadConfig(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const src = normalizeShop(process.env.SRC_SHOP);
  const dst = normalizeShop(process.env.DST_SHOP);
  const missing = [];
  if (!src) missing.push('SRC_SHOP');
  if (!process.env.SRC_TOKEN) missing.push('SRC_TOKEN');
  if (!dst) missing.push('DST_SHOP');
  if (!process.env.DST_TOKEN) missing.push('DST_TOKEN');
  if (missing.length) {
    throw new Error(
      `Variables d'environnement manquantes : ${missing.join(', ')}\n` +
        `  export SRC_SHOP=source.myshopify.com SRC_TOKEN=shpat_xxx\n` +
        `  export DST_SHOP=destination.myshopify.com DST_TOKEN=shpat_yyy`
    );
  }
  if (src === dst) throw new Error('SRC_SHOP et DST_SHOP sont identiques : refus par sécurité.');
  return {
    source: { shop: src, token: process.env.SRC_TOKEN, label: 'source' },
    destination: { shop: dst, token: process.env.DST_TOKEN, label: 'destination' },
    apiVersion: process.env.SHOPIFY_API_VERSION || null,
    steps: args.steps || ALL_STEPS,
    yes: args.yes || process.env.CONFIRM_WRITES === 'yes',
    dryRun: args.dryRun,
    limit: Number.isFinite(args.limit) && args.limit > 0 ? args.limit : null,
    skipTheme: args.skipTheme,
    help: args.help === true
  };
}

export const HELP = `
Duplication d'une boutique Shopify (source -> destination), idempotente.

Variables requises :
  SRC_SHOP, SRC_TOKEN, DST_SHOP, DST_TOKEN
Variable optionnelle :
  SHOPIFY_API_VERSION (sinon : dernière version stable détectée automatiquement)

Usage :
  node src/index.js [options]

Options :
  --steps=a,b     N'exécuter que ces étapes (${ALL_STEPS.join(', ')})
  --skip=a,b      Exécuter tout sauf ces étapes
  --limit=N       Limiter le nombre d'éléments par ressource (tests)
  --dry-run       Aucune écriture sur la destination
  --skip-theme    Ne pas tirer/pousser le thème
  --yes           Ne pas demander de confirmation avant la première écriture
  --help          Cette aide

La source n'est JAMAIS modifiée : le client source refuse toute mutation.
`;
