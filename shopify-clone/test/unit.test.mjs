import { test } from 'node:test';
import assert from 'node:assert/strict';

import { baseFileName, cleanCdnUrl, compact, fileNameFromUrl, isReservedNamespace, rewriteLinks } from '../src/util.js';
import { IdMaps } from '../src/maps.js';
import { variantKey } from '../src/steps/products.js';
import { parseArgs } from '../src/config.js';

test('nom de fichier extrait des URL CDN', () => {
  assert.equal(fileNameFromUrl('https://cdn.shopify.com/s/files/1/0001/files/logo.png?v=12345'), 'logo.png');
  assert.equal(baseFileName('https://cdn.shopify.com/s/files/1/0001/files/logo_1024x1024.png?v=1'), 'logo.png');
  assert.equal(baseFileName('https://cdn.shopify.com/s/files/1/0001/files/photo_600x.jpg'), 'photo.jpg');
  assert.equal(baseFileName('https://cdn.shopify.com/s/files/1/0001/files/deja-propre.webp'), 'deja-propre.webp');
  assert.equal(fileNameFromUrl(null), null);
});

test('URL CDN nettoyée de ses paramètres', () => {
  assert.equal(
    cleanCdnUrl('https://cdn.shopify.com/s/files/1/0001/files/a.png?v=99&width=100'),
    'https://cdn.shopify.com/s/files/1/0001/files/a.png'
  );
});

test('liens absolus vers la source réécrits en relatif', () => {
  const domains = ['source.myshopify.com', 'boutique-source.fr'];
  assert.equal(rewriteLinks('<a href="https://source.myshopify.com/collections/ete">Été</a>', domains), '<a href="/collections/ete">Été</a>');
  assert.equal(rewriteLinks('https://www.boutique-source.fr/pages/contact', domains), '/pages/contact');
  assert.equal(rewriteLinks('https://autre-site.com/x', domains), 'https://autre-site.com/x');
  assert.equal(rewriteLinks(null, domains), null);
});

test('compact retire null, undefined et objets vides', () => {
  assert.deepEqual(compact({ a: 1, b: null, c: undefined, d: { e: null }, f: { g: 2 }, h: [1, null, 2] }), {
    a: 1,
    f: { g: 2 },
    h: [1, 2]
  });
});

test('namespaces réservés reconnus', () => {
  assert.equal(isReservedNamespace('shopify--discovery--product_search_boost'), true);
  assert.equal(isReservedNamespace('shopify'), true);
  assert.equal(isReservedNamespace('app--123--truc'), true);
  assert.equal(isReservedNamespace('custom'), false);
});

test('clé de variante : SKU sinon options', () => {
  assert.equal(variantKey({ sku: 'ABC-1', selectedOptions: [{ name: 'Taille', value: 'M' }] }), 'sku:ABC-1');
  assert.equal(variantKey({ sku: '   ', selectedOptions: [{ name: 'Taille', value: 'M' }] }), 'opt:Taille=M');
  assert.equal(
    variantKey({ selectedOptions: [{ name: 'Taille', value: 'M' }, { name: 'Couleur', value: 'Bleu' }] }),
    'opt:Taille=M|Couleur=Bleu'
  );
});

test('remapValue traduit un GID seul et une liste de GIDs', () => {
  const maps = new IdMaps();
  maps.set('products', 'gid://shopify/Product/1', 'gid://shopify/Product/100');
  maps.set('files', 'gid://shopify/MediaImage/2', 'gid://shopify/MediaImage/200');

  assert.deepEqual(maps.remapValue('gid://shopify/Product/1'), { value: 'gid://shopify/Product/100', resolved: true });
  assert.deepEqual(maps.remapValue('gid://shopify/Product/9'), { value: 'gid://shopify/Product/9', resolved: false });
  assert.deepEqual(
    maps.remapValue(JSON.stringify(['gid://shopify/Product/1', 'gid://shopify/MediaImage/2'])),
    { value: JSON.stringify(['gid://shopify/Product/100', 'gid://shopify/MediaImage/200']), resolved: true }
  );
  assert.deepEqual(maps.remapValue('texte libre'), { value: 'texte libre', resolved: true });
  assert.deepEqual(maps.remapValue('["a","b"]'), { value: '["a","b"]', resolved: true });
});

test('remapValue signale une liste partiellement résolue', () => {
  const maps = new IdMaps();
  maps.set('products', 'gid://shopify/Product/1', 'gid://shopify/Product/100');
  const out = maps.remapValue(JSON.stringify(['gid://shopify/Product/1', 'gid://shopify/Product/2']));
  assert.equal(out.resolved, false);
  assert.deepEqual(JSON.parse(out.value), ['gid://shopify/Product/100', 'gid://shopify/Product/2']);
});

test('options de ligne de commande', () => {
  assert.deepEqual(parseArgs(['--steps=audit,products']).steps, ['audit', 'products']);
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.equal(parseArgs(['--limit=5']).limit, 5);
  assert.deepEqual(parseArgs(['--skip=theme,verify']).steps.includes('theme'), false);
  assert.throws(() => parseArgs(['--steps=nimportequoi']), /Étapes inconnues/);
});
