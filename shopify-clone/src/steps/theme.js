import { spawn } from 'node:child_process';
import { access, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { detail, fail, info, ok, step, warn } from '../log.js';

export const THEME_DIR = resolve(process.cwd(), 'theme');
export const THEME_NAME = 'Copie source';

function run_(command, args, { env } = {}) {
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env }, shell: false });
    child.on('error', (err) => done({ code: -1, error: err }));
    child.on('close', (code) => done({ code }));
  });
}

async function hasShopifyCli() {
  const result = await new Promise((done) => {
    const child = spawn('shopify', ['version'], { stdio: 'ignore', shell: false });
    child.on('error', () => done(false));
    child.on('close', (code) => done(code === 0));
  });
  return result;
}

export async function run(ctx) {
  step('11. Thème');

  if (ctx.config.skipTheme) {
    info('Étape thème ignorée (--skip-theme).');
    return;
  }

  const manual = [
    `shopify theme pull --store ${ctx.config.source.shop} --password $SRC_TOKEN --live --path ./theme`,
    `shopify theme push --store ${ctx.config.destination.shop} --password $DST_TOKEN --path ./theme --unpublished --theme "${THEME_NAME}"`
  ];

  if (!(await hasShopifyCli())) {
    warn('Shopify CLI absent (npm i -g @shopify/cli). Commandes à lancer à la main :');
    for (const line of manual) detail(line);
    ctx.report.theme = { done: false, manual };
    return;
  }

  await mkdir(THEME_DIR, { recursive: true });

  let alreadyPulled = false;
  try {
    await access(resolve(THEME_DIR, 'layout', 'theme.liquid'));
    alreadyPulled = true;
  } catch {
    alreadyPulled = false;
  }

  if (alreadyPulled) {
    info('Thème déjà présent dans ./theme — récupération ignorée (supprimer le dossier pour la refaire).');
  } else {
    info(`Récupération du thème publié de ${ctx.config.source.shop}…`);
    const pull = await run_('shopify', [
      'theme',
      'pull',
      '--store',
      ctx.config.source.shop,
      '--password',
      ctx.config.source.token,
      '--live',
      '--path',
      THEME_DIR
    ]);
    if (pull.code !== 0) {
      fail("Récupération du thème en échec. Vérifier le droit read_themes sur le jeton source.");
      for (const line of manual) detail(line);
      ctx.report.theme = { done: false, manual };
      return;
    }
    ok('Thème récupéré dans ./theme');
  }

  const files = await readdir(THEME_DIR).catch(() => []);
  if (!files.length) {
    fail('./theme est vide : rien à envoyer.');
    ctx.report.theme = { done: false, manual };
    return;
  }

  if (ctx.config.dryRun) {
    info('[dry-run] envoi du thème non effectué.');
    ctx.report.theme = { done: false, dryRun: true, manual };
    return;
  }

  info(`Envoi du thème vers ${ctx.config.destination.shop} en thème non publié « ${THEME_NAME} »…`);
  const push = await run_('shopify', [
    'theme',
    'push',
    '--store',
    ctx.config.destination.shop,
    '--password',
    ctx.config.destination.token,
    '--path',
    THEME_DIR,
    '--unpublished',
    '--theme',
    THEME_NAME
  ]);

  if (push.code !== 0) {
    fail("Envoi du thème en échec. Vérifier le droit write_themes sur le jeton destination.");
    for (const line of manual) detail(line);
    ctx.report.theme = { done: false, manual };
    return;
  }

  ok(`Thème envoyé en tant que « ${THEME_NAME} » (non publié — à publier à la main après contrôle).`);
  ctx.report.theme = { done: true, name: THEME_NAME, published: false };
}
