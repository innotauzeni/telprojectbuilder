// Builds the generated-system web app template ONCE and copies it into the Studio's wwwroot/preview-app,
// so the Studio preview can show the real app for any project (the Studio feeds it entities.json + config.json).
//
// Dependencies are cached in .cache/preview-app, so only the first run needs a long `npm install`.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const template = resolve(here, '../../ProjectBuilder.Generator/AngularTemplate');
const cache = resolve(here, '../.cache/preview-app');
const target = resolve(here, '../../ProjectBuilder.Studio/wwwroot/preview-app');

function run(cmd, cwd) {
  const r = spawnSync(cmd, { cwd, stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error(`\n"${cmd}" failed in ${cwd}`); process.exit(r.status ?? 1); }
}

if (!existsSync(join(template, 'package.json'))) { console.error('Template not found: ' + template); process.exit(1); }

console.log('› Preparing preview app sources');
mkdirSync(cache, { recursive: true });
// refresh sources but keep node_modules
for (const entry of ['src', 'public', 'angular.json', 'package.json', 'tsconfig.json', 'tsconfig.app.json', 'proxy.conf.json']) {
  rmSync(join(cache, entry), { recursive: true, force: true });
  cpSync(join(template, entry), join(cache, entry), { recursive: true });
}
const indexPath = join(cache, 'src/index.html');
writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replaceAll('__APP_NAME__', 'Preview'));
const pkgPath = join(cache, 'package.json');
writeFileSync(pkgPath, readFileSync(pkgPath, 'utf8').replaceAll('__APP_SLUG__', 'preview'));

const marker = join(cache, '.installed-package.json');
const pkg = readFileSync(pkgPath, 'utf8');
if (!existsSync(join(cache, 'node_modules')) || !existsSync(marker) || readFileSync(marker, 'utf8') !== pkg) {
  console.log('› Installing dependencies (first run only, a few minutes)');
  run('npm install --no-audit --no-fund', cache);
  writeFileSync(marker, pkg);
}

console.log('› Building preview app');
run('npm run build', cache);

console.log('› Copying to ' + target);
rmSync(target, { recursive: true, force: true });
mkdirSync(dirname(target), { recursive: true });
cpSync(join(cache, 'dist/web/browser'), target, { recursive: true });
console.log('✔ Preview app ready');
