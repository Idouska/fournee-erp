import { errors, warnings } from './log.js';
import { exportPath, formatDuration, writeJson } from './util.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const CHECKLIST = [
  "Nom, adresse et e-mail de la boutique (Paramètres > Détails de la boutique)",
  "Domaine personnalisé : un domaine ne peut pointer que vers une seule boutique",
  'Shopify Payments et autres moyens de paiement',
  'Réglages du checkout (champs, règles, pages de remerciement)',
  'Taxes et douanes',
  'Langue principale (les langues secondaires ont été activées par le script)',
  "Modèles d'e-mails de notification",
  'Comptes du personnel et permissions',
  'Applications tierces : à réinstaller une par une, leurs données ne se copient pas',
  "Métachamps shopify--discovery--* : recréés par l'application Search & Discovery",
  "Mots de passe clients : non migrables, les clients doivent en redéfinir un",
  'Publier le thème importé une fois le contrôle visuel fait',
  "Révoquer les deux applications personnalisées ou régénérer les jetons shpat_ après migration"
];

function table(rows) {
  const lines = ['| Ressource | Source | Destination | Écart |', '| --- | ---: | ---: | ---: |'];
  for (const row of rows) {
    if (row.error) {
      lines.push(`| ${row.label} | — | — | comptage impossible |`);
      continue;
    }
    const diff = row.destination - row.source;
    lines.push(`| ${row.label} | ${row.source} | ${row.destination} | ${diff === 0 ? '✅ 0' : `⚠️ ${diff > 0 ? '+' : ''}${diff}`} |`);
  }
  return lines.join('\n');
}

function section(title, body) {
  return body ? `\n## ${title}\n\n${body}\n` : '';
}

export async function writeReport(ctx) {
  const r = ctx.report;
  const duration = formatDuration(Date.now() - ctx.startedAtMs);

  let md = `# Rapport de duplication Shopify\n\n`;
  md += `- **Source** : \`${ctx.config.source.shop}\`\n`;
  md += `- **Destination** : \`${ctx.config.destination.shop}\`\n`;
  md += `- **Version d'API** : \`${ctx.dst.apiVersion}\`\n`;
  md += `- **Étapes exécutées** : ${ctx.config.steps.join(', ')}\n`;
  md += `- **Durée** : ${duration}\n`;
  md += `- **Date** : ${ctx.startedAt}\n`;
  if (ctx.config.dryRun) md += `- **Mode** : simulation (aucune écriture)\n`;
  if (ctx.config.limit) md += `- **Limite** : ${ctx.config.limit} éléments par ressource\n`;

  if (r.verify?.rows?.length) {
    md += section('Comparaison des compteurs', table(r.verify.rows));
    if (r.verify.gaps?.length) {
      md += section(
        'Écarts à traiter',
        r.verify.gaps
          .map((g) => `- **${g.label}** : ${g.source} sur la source, ${g.destination} sur la destination (${g.diff > 0 ? '+' : ''}${g.diff})`)
          .join('\n')
      );
    } else if (r.verify.rows.length) {
      md += section('Écarts à traiter', 'Aucun écart de compteur.');
    }
  }

  if (r.verify?.theme) {
    const t = r.verify.theme;
    const body = [
      `${t.files} fichier(s) de thème analysés.`,
      '',
      t.missingImages.length
        ? `### Images référencées mais absentes (${t.missingImages.length})\n\n${t.missingImages.map((i) => `- \`${i}\``).join('\n')}`
        : '✅ Toutes les images référencées par le thème existent sur la destination.',
      '',
      t.missingHandles.length
        ? `### Handles référencés mais absents (${t.missingHandles.length})\n\n${t.missingHandles.map((i) => `- \`${i}\``).join('\n')}`
        : '✅ Tous les handles référencés par le thème existent sur la destination.'
    ].join('\n');
    md += section('Contrôle du thème', body);
  }

  const details = [];
  if (r.files) details.push(`- **Fichiers** : ${r.files.created} créé(s), ${r.files.skippedProductMedia} média(s) produit ignoré(s) sur ${r.files.source} fichiers source`);
  if (r.metafields) {
    details.push(`- **Définitions de métachamps** : ${r.metafields.definitions.created} créée(s) (${r.metafields.definitions.reserved} réservée(s) ignorée(s))`);
    details.push(`- **Définitions de métaobjets** : ${r.metafields.metaobjectDefinitions.created} créée(s)`);
    details.push(`- **Métaobjets** : ${r.metafields.metaobjects.created} créé(s), ${r.metafields.metaobjects.updated} mis à jour`);
  }
  if (r.products) details.push(`- **Produits** : ${r.products.created} créé(s), ${r.products.updated} mis à jour, ${r.products.published} publié(s), ${r.products.inventoryEntries} ligne(s) de stock`);
  if (r.collections) details.push(`- **Collections** : ${r.collections.created} créée(s), ${r.collections.updated} mise(s) à jour`);
  if (r.content) {
    details.push(`- **Pages** : ${r.content.pages.created} créée(s), ${r.content.pages.updated} mise(s) à jour`);
    details.push(`- **Blogs** : ${r.content.blogs.created} créé(s) · **Articles** : ${r.content.articles.created} créé(s)`);
  }
  if (r.menus) details.push(`- **Menus** : ${r.menus.created} créé(s), ${r.menus.updated} mis à jour, ${r.menus.fallbacks} entrée(s) converties en lien relatif`);
  if (r.settings) {
    details.push(`- **Politiques légales** : ${r.settings.policies.copied}/${r.settings.policies.total}`);
    details.push(`- **Redirections** : ${r.settings.redirects.created} créée(s)`);
    details.push(`- **Zones d'expédition** : ${r.settings.shipping.zones} recréée(s)`);
    details.push(`- **Langues activées** : ${r.settings.locales?.enabled ?? 0}`);
    details.push(`- **Clients** : ${r.settings.customers.created} créé(s), ${r.settings.customers.skipped} ignoré(s)`);
  }
  if (r.relink) details.push(`- **Références croisées** : ${r.relink.fixed} reliée(s), ${r.relink.stillUnresolved} orpheline(s)`);
  if (r.translations) details.push(`- **Traductions** : ${r.translations.registered} enregistrée(s) (${r.translations.locales.join(', ')})`);
  if (r.theme) details.push(`- **Thème** : ${r.theme.done ? `importé sous « ${r.theme.name} », non publié` : 'à faire à la main'}`);
  md += section('Détail par étape', details.join('\n'));

  if (errors.length) {
    md += section(
      `Erreurs (${errors.length})`,
      errors.slice(0, 100).map((e) => `- \`${e.step}\` — ${e.message}`).join('\n') +
        (errors.length > 100 ? `\n\n… et ${errors.length - 100} autre(s).` : '')
    );
  }
  if (warnings.length) {
    md += section(
      `Avertissements (${warnings.length})`,
      warnings.slice(0, 100).map((w) => `- \`${w.step}\` — ${w.message}`).join('\n') +
        (warnings.length > 100 ? `\n\n… et ${warnings.length - 100} autre(s).` : '')
    );
  }

  md += section('À faire à la main', CHECKLIST.map((item) => `- [ ] ${item}`).join('\n'));
  md += `\n---\n\nRelancer le script est sans risque : tout est apparié par handle, nom de fichier ou namespace.key.\n`;

  const path = exportPath('rapport.md');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, md, 'utf8');
  await writeJson(exportPath('rapport.json'), {
    source: ctx.config.source.shop,
    destination: ctx.config.destination.shop,
    startedAt: ctx.startedAt,
    duration,
    steps: ctx.config.steps,
    report: r,
    errors,
    warnings
  });
  return path;
}
