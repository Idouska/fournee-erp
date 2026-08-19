# Duplication d'une boutique Shopify

Copie le contenu d'une boutique Shopify vers une autre via l'**Admin GraphQL API**.
Script Node, **sans aucune dépendance**, **idempotent** : on peut le relancer autant
de fois que nécessaire sans créer de doublons (appariement par *handle*, nom de
fichier ou `namespace.key`).

La boutique **source n'est jamais modifiée** : son client GraphQL refuse toute mutation.

## Prérequis

- Node 18 ou plus (testé sur Node 22)
- Shopify CLI pour l'étape du thème : `npm i -g @shopify/cli`
- Une application personnalisée sur **chaque** boutique, avec son jeton `shpat_…`

### Droits à cocher sur l'application personnalisée

Lecture seule sur la source, lecture **et** écriture sur la destination :

```
products, inventory, locations, content, online_store_pages,
online_store_navigation, themes, files, customers, discounts,
metaobject_definitions, metaobjects, legal_policies, shipping,
markets, publications, translations, locales
```

Le jeton s'affiche **une seule fois** au moment de l'installation.

## Utilisation

```bash
export SRC_SHOP=source.myshopify.com      SRC_TOKEN=shpat_xxx
export DST_SHOP=destination.myshopify.com DST_TOKEN=shpat_yyy

cd shopify-clone
node src/index.js --steps=audit    # 1. inspecter la source, rien n'est écrit
node src/index.js --dry-run        # 2. répétition générale, rien n'est écrit
node src/index.js                  # 3. duplication (confirmation demandée)
node src/index.js --steps=verify   # 4. recontrôle à tout moment
```

Avant la première écriture, le script affiche les étapes concernées et demande de
retaper le domaine de destination.

### Options

| Option | Effet |
| --- | --- |
| `--steps=a,b` | N'exécuter que ces étapes |
| `--skip=a,b` | Tout exécuter sauf ces étapes |
| `--limit=N` | N éléments par ressource — pour tester sur un échantillon |
| `--dry-run` | Aucune écriture : les mutations sont affichées, pas envoyées |
| `--skip-theme` | Ne pas tirer/pousser le thème |
| `--yes` | Pas de confirmation (indispensable hors terminal interactif) |
| `--help` | Aide |

Variable optionnelle : `SHOPIFY_API_VERSION`. Par défaut, le script interroge la
boutique et retient la **dernière version stable** qu'elle supporte.

## Ordre des étapes

| # | Étape | Contenu |
| --- | --- | --- |
| 1 | `audit` | Compteurs + export JSON complet de la source dans `./export/` |
| 2 | `files` | Contenu > Fichiers, mêmes noms de fichier (les thèmes utilisent `shopify://shop_images/<nom>`). Les médias produit sont exclus : ils reviennent avec les produits |
| 3 | `metafields` | Définitions de métachamps, définitions de métaobjets, métaobjets |
| 4 | `products` | `productSet` (handle, médias, options, variantes, métachamps), puis stock et publication sur les mêmes canaux |
| 5 | `collections` | Manuelles (avec l'ordre) et automatiques (règles), image, SEO, métachamps |
| 6 | `content` | Pages, blogs, articles |
| 7 | `menus` | Mêmes handles, entrées reliées aux ressources de la destination |
| 8 | `settings` | Politiques légales, redirections, zones et tarifs d'expédition, langues, métachamps de boutique, clients |
| 9 | `relink` | Deuxième passe sur les références qui pointaient vers des ressources pas encore créées |
| 10 | `translations` | Traductions des ressources copiées, langue par langue |
| 11 | `theme` | `theme pull --live` sur la source, `theme push --unpublished` sur la destination. **Ne publie pas** |
| 12 | `verify` | Recompare tous les compteurs, puis vérifie qu'aucun fichier de thème ne référence une image ou un handle absent de la destination |

## Ce que produit le script

```
export/
  audit.json          compteurs de la source
  products.json       … et un fichier par ressource exportée
  map.json            correspondance identifiant source -> identifiant destination
  rapport.md          rapport lisible : écarts, erreurs, avertissements, checklist
  rapport.json        le même, exploitable par un autre script
theme/                thème récupéré depuis la source
```

## Robustesse

- **Limites de débit** : le coût de chaque requête est suivi (`throttleStatus`),
  le script attend avant de dépasser le seau et réessaie sur `THROTTLED`, 429 et 5xx.
- **Écarts de version d'API** : les champs d'entrée absents de la version utilisée
  sont retirés par introspection au lieu de faire échouer l'étape entière.
- **Erreurs isolées** : un produit en erreur n'interrompt ni les autres produits ni
  les étapes suivantes ; tout est consigné dans le rapport.
- **Reprise** : `export/map.json` est écrit au fil de l'eau ; une exécution
  interrompue reprend sans recréer ce qui existe déjà.

## Ce qui reste manuel

Nom, adresse et e-mail de la boutique · domaine · Shopify Payments et moyens de
paiement · réglages du checkout · taxes · langue principale · modèles de
notifications · comptes du personnel · applications tierces (à réinstaller, leurs
données ne se copient pas) · métachamps `shopify--discovery--*` (recréés par
l'app Search & Discovery) · mots de passe clients · publication du thème.

La liste complète est reprise en fin de `export/rapport.md`.

## Après la migration

Révoquer les deux applications personnalisées ou régénérer leurs jetons : un
`shpat_…` donne un accès complet à l'admin.

## Tests

```bash
npm test
```
