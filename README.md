# Fournee ERP V5

ERP web gratuit pour piloter une petite boulangerie : caisse, vendeuses, produits avec photos, production, fiches recettes detaillees, consommation automatique du stock, stocks sensibles, DLC, achats, documents commerciaux imprimables, commandes clientes, charges, marges, objectifs, graphiques, cloture de journee, login et synchronisation Supabase.

## Lancer en local

Ouvrir `index.html` dans un navigateur, ou lancer :

```bash
python3 -m http.server 5173
```

Puis aller sur `http://127.0.0.1:5173`.

## Hebergement gratuit

## Publier sur GitHub

Creer d'abord un depot vide sur GitHub, par exemple `fournee-erp`, sans README.

Puis dans ce dossier :

```bash
git remote add origin https://github.com/VOTRE_COMPTE/fournee-erp.git
git push -u origin main
```

### Cloudflare Pages

1. Creer un compte Cloudflare.
2. Creer un repo GitHub avec ces fichiers.
3. Dans Cloudflare Pages, connecter le repo.
4. Build command : laisser vide.
5. Output directory : `/`.

### GitHub Pages

1. Mettre les fichiers dans un repo GitHub.
2. Aller dans `Settings > Pages`.
3. Source : `Deploy from a branch`.
4. Branch : `main`, folder `/root`.

## Donnees

La V5 stocke les donnees dans le navigateur avec `localStorage`. Elle peut aussi synchroniser vers Supabase avec login email/mot de passe.

Pour passer en mode equipe/multi-poste, creer un projet Supabase gratuit, executer `supabase_schema.sql`, puis saisir l'URL Supabase et la anon key dans `Reglages > Cloud Supabase`.

## Roadmap conseillee

1. Ajouter connexion utilisateur Supabase.
2. Synchroniser ventes, vendeuses, produits, achats, production, commandes, documents et charges.
3. Ajouter fiches recettes detaillees avec decomposition ingredients.
4. Ajouter sauvegarde automatique quotidienne.
5. Ajouter import caisse CSV.
