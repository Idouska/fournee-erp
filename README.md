# Fournee ERP V2

ERP web gratuit pour piloter une petite boulangerie : caisse, production, recettes, stock, achats, commandes clientes, charges, marges, objectifs et cloture de journee.

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

La V2 stocke les donnees dans le navigateur avec `localStorage`. C'est parfait pour tester sans compte et sans serveur.

Pour passer en mode equipe/multi-poste, creer un projet Supabase gratuit et executer `supabase_schema.sql`. Ensuite, remplacer les lectures/ecritures `localStorage` dans `app.js` par les appels Supabase.

## Roadmap conseillee

1. Ajouter connexion utilisateur Supabase.
2. Synchroniser ventes, produits, achats, production, commandes et charges.
3. Ajouter fiches recettes detaillees avec decomposition ingredients.
4. Ajouter sauvegarde automatique quotidienne.
5. Ajouter import caisse CSV.
