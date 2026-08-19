#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { HELP, loadConfig } from './config.js';
import { ShopifyClient } from './graphql.js';
import { SchemaCompat } from './compat.js';
import { SourceData } from './source-data.js';
import { IdMaps } from './maps.js';
import { writeReport } from './report.js';
import { detail, errors, fail, info, ok, setStep, step, warn, warnings } from './log.js';
import { exportPath, formatDuration, rewriteLinks } from './util.js';

import * as audit from './steps/audit.js';
import * as files from './steps/files.js';
import * as metafields from './steps/metafields.js';
import * as products from './steps/products.js';
import * as collections from './steps/collections.js';
import * as content from './steps/content.js';
import * as menus from './steps/menus.js';
import * as settings from './steps/settings.js';
import * as relink from './steps/relink.js';
import * as translations from './steps/translations.js';
import * as theme from './steps/theme.js';
import * as verify from './steps/verify.js';

const STEPS = { audit, files, metafields, products, collections, content, menus, settings, relink, translations, theme, verify };
const READ_ONLY_STEPS = new Set(['audit', 'verify']);

async function confirm(config) {
  if (config.yes || config.dryRun) return true;
  if (!stdin.isTTY) {
    throw new Error(
      "Confirmation impossible hors terminal interactif. Relancer avec --yes (ou CONFIRM_WRITES=yes) en connaissance de cause."
    );
  }
  const rl = createInterface({ input: stdin, output: stdout });
  console.log('');
  console.log(`  Les étapes suivantes vont ÉCRIRE sur ${config.destination.shop} :`);
  console.log(`  ${config.steps.filter((s) => !READ_ONLY_STEPS.has(s)).join(', ')}`);
  console.log(`  La boutique source ${config.source.shop} ne sera jamais modifiée.`);
  console.log('');
  const answer = await rl.question(`  Taper le domaine de destination pour confirmer : `);
  rl.close();
  return answer.trim() === config.destination.shop;
}

async function main() {
  const config = loadConfig();
  if (config.help) {
    console.log(HELP);
    return 0;
  }

  const startedAtMs = Date.now();
  console.log('');
  console.log(`  Duplication Shopify`);
  console.log(`  source      : ${config.source.shop}  (lecture seule)`);
  console.log(`  destination : ${config.destination.shop}`);

  const src = new ShopifyClient(config.source, { apiVersion: config.apiVersion, readOnly: true });
  const dst = new ShopifyClient(config.destination, { apiVersion: config.apiVersion, dryRun: config.dryRun });

  if (!config.apiVersion) {
    try {
      const version = await dst.detectApiVersion();
      src.apiVersion = version;
      dst.apiVersion = version;
    } catch (err) {
      warn(`Détection de la version d'API impossible (${err.message}) — repli sur ${dst.apiVersion}.`);
    }
  }
  console.log(`  API         : ${dst.apiVersion}`);

  // Contrôle d'accès avant toute chose : mieux vaut échouer ici que sur l'étape 6.
  for (const client of [src, dst]) {
    try {
      const data = await client.request('{ shop { name myshopifyDomain } }');
      console.log(`  ${client.label.padEnd(11)} : accès confirmé « ${data.shop.name} »`);
    } catch (err) {
      throw new Error(`Accès à la boutique ${client.label} (${client.shop}) impossible.\n  ${err.message}`);
    }
  }

  const writeSteps = config.steps.filter((s) => !READ_ONLY_STEPS.has(s));
  if (writeSteps.length && !(await confirm(config))) {
    console.log('\n  Confirmation refusée : aucune écriture effectuée.\n');
    return 1;
  }

  const source = new SourceData(src, { limit: config.limit });
  const maps = await IdMaps.load();
  const compat = new SchemaCompat(dst);

  const ctx = {
    config,
    src,
    dst,
    source,
    maps,
    compat,
    report: {},
    startedAt: new Date().toISOString(),
    startedAtMs,
    rewrite: (text) => text
  };

  // Réécriture des liens absolus vers la source (domaine myshopify + domaine public).
  try {
    const shop = await source.get('shop');
    const domains = [config.source.shop, shop?.primaryDomain?.host].filter(Boolean);
    ctx.rewrite = (text) => rewriteLinks(text, domains);
    if (shop?.currencyCode) detail(`devise source : ${shop.currencyCode}`);
  } catch (err) {
    warn(`Informations de boutique source illisibles (${err.message}) : liens absolus non réécrits.`);
  }

  for (const name of config.steps) {
    const module = STEPS[name];
    if (!module) continue;
    setStep(name);
    try {
      await module.run(ctx);
    } catch (err) {
      fail(`étape « ${name} » interrompue : ${err.message}`);
      if (process.env.DEBUG) console.error(err);
    }
    await maps.save();
  }

  step('Résumé');
  compat.report();
  const reportPath = await writeReport(ctx);
  info(`Requêtes : ${src.stats.requests} sur la source, ${dst.stats.requests} sur la destination (${src.stats.retries + dst.stats.retries} reprises)`);
  info(`Durée : ${formatDuration(Date.now() - startedAtMs)}`);
  if (errors.length) fail(`${errors.length} erreur(s) — détail dans le rapport.`);
  if (warnings.length) warn(`${warnings.length} avertissement(s).`);
  ok(`Rapport : ${reportPath}`);
  console.log('');
  console.log(`  Export JSON complet : ${exportPath('')}`);
  console.log(`  Table de correspondance des identifiants : ${exportPath('map.json')}`);
  console.log('');
  return errors.length ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\n  ${err.message}\n`);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  });
