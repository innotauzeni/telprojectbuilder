// End-to-end browser test for the STUDIO itself (designer + preview), including the real generated web app
// running inside the preview.
//
//   (cd src/studio-web && npm install && npm run build)       builds the Studio UI and the preview app
//   dotnet build src/ProjectBuilder.Studio
//   node studio.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = resolve(import.meta.dirname, '../..');
const studioDir = join(root, 'src/ProjectBuilder.Studio');
const dll = process.env.STUDIO_DLL ?? ['Debug', 'Release'].map((c) => join(studioDir, 'bin', c, 'net10.0', 'ProjectBuilder.Studio.dll')).find(existsSync);
if (!dll) { console.error('Build the Studio first: dotnet build src/ProjectBuilder.Studio'); process.exit(2); }
if (!existsSync(join(studioDir, 'wwwroot/index.html'))) { console.error('Studio web app not built: cd src/studio-web && npm run build'); process.exit(2); }
if (!existsSync(join(studioDir, 'wwwroot/preview-app/index.html'))) { console.error('Preview app not built: cd src/studio-web && npm run build'); process.exit(2); }

const chromePath = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));
if (!chromePath) { console.error('Chrome/Edge not found. Set CHROME_PATH.'); process.exit(2); }

const port = 5400 + Math.floor(Math.random() * 200); // Chrome blocks some ports; stay in 5400-5599
const base = `http://127.0.0.1:${port}`;
const dataDir = mkdtempSync(join(tmpdir(), 'pb-studio-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 0;
const ok = (m) => console.log(`  ✔ ${++step}. ${m}`);

const server = spawn('dotnet', [dll, '--urls', base],
  { cwd: studioDir, stdio: 'ignore', env: { ...process.env, STUDIO_DATA_DIR: dataDir, ASPNETCORE_ENVIRONMENT: 'Development' } });
let browser;
async function cleanup(code) {
  try { await browser?.close(); } catch { /* ignore */ }
  try { server.kill(); } catch { /* ignore */ }
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  setTimeout(() => { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ } process.exit(code); }, 600);
}

try {
  for (let i = 0; ; i++) {
    try { const r = await fetch(base + '/api/account/me'); if (r.ok || r.status === 401) break; } catch { /* not yet */ }
    if (i > 60) throw new Error('Studio did not start');
    await sleep(500);
  }

  browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.setDefaultTimeout(20000);
  await page.setViewport({ width: 1366, height: 900 });

  const bodyHas = (ctx, s) => ctx.waitForFunction((t) => document.body.innerText.includes(t), {}, s);
  const setValue = (ctx, sel, v) => ctx.$eval(sel, (el, val) => {
    el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
  const clickText = async (ctx, selector, label) => {
    const h = await ctx.evaluateHandle((s, l) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(l)), selector, label);
    const el = h.asElement();
    if (!el) throw new Error(`no ${selector} containing "${label}"`);
    await el.click();
  };

  // ---- accounts: signed-out visitors are sent to sign in; sign up through the UI ----
  await page.goto(base + '/', { waitUntil: 'networkidle0' });
  if (!page.url().includes('/login')) throw new Error('a signed-out visitor should land on /login, got ' + page.url());
  ok('signed-out visitor is redirected to the sign-in page');

  // the language picker is available before signing in
  await page.select('header app-language-switcher select', 'fr');
  await bodyHas(page, 'Bon retour');
  await bodyHas(page, 'Se connecter');
  await page.select('header app-language-switcher select', 'en');
  await bodyHas(page, 'Welcome back');
  ok('the sign-in page can be switched to French and back');

  await clickText(page, 'a', 'Create an account');
  await page.waitForFunction(() => location.pathname === '/register');
  const email = 'tester' + Date.now() + '@example.com';
  await setValue(page, '#email', email);
  await setValue(page, '#password', 'short');
  await page.click('button[type=submit]');
  await bodyHas(page, 'at least 8');
  ok('a weak password is rejected with a clear message');

  await setValue(page, '#password', 'Str0ng!Passw0rd');
  await page.click('button[type=submit]');
  await bodyHas(page, 'Build a complete system without writing code');
  await bodyHas(page, email);
  ok('account created: lands on the projects page with the email shown in the header');

  // languages: Spanish on the home page, remembered after a reload, then English again for the rest of the test
  await page.select('header app-language-switcher select', 'es');
  await bodyHas(page, 'Cree un sistema completo sin escribir código');
  await bodyHas(page, 'Sus proyectos');
  await page.reload({ waitUntil: 'networkidle0' });
  await bodyHas(page, 'Cree un sistema completo sin escribir código');
  if ((await page.evaluate(() => document.documentElement.lang)) !== 'es') throw new Error('html lang should be es after reload');
  await page.select('header app-language-switcher select', 'sw');
  await bodyHas(page, 'Unda mfumo kamili bila kuandika msimbo');
  await page.select('header app-language-switcher select', 'en');
  await bodyHas(page, 'Build a complete system without writing code');
  ok('the Studio speaks Spanish and Swahili, remembers the choice after a reload, and switches back to English');

  // ---- home ----
  await page.goto(base + '/', { waitUntil: 'networkidle0' });
  await bodyHas(page, 'Build a complete system without writing code');
  await bodyHas(page, 'Enrolment System');
  ok('home page shows the hero and the Enrolment template');

  // ---- create from template -> designer ----
  await clickText(page, 'button', 'Use this template');
  await page.waitForFunction(() => location.pathname.startsWith('/designer/'));
  await page.waitForSelector('#name');
  const projectId = page.url().split('/').pop();
  const name = await page.$eval('#name', (e) => e.value);
  if (name !== 'Enrolment System') throw new Error('designer did not load the template: ' + name);
  ok('template opens in the designer');

  const tiles = await page.$$eval('.tile', (t) => t.map((x) => ({ text: x.innerText, on: x.classList.contains('on') })));
  const menuTile = tiles.find((t) => t.text.includes('Access control'));
  const webTile = tiles.find((t) => t.text.includes('Angular web app'));
  if (!menuTile?.on || !webTile?.on) throw new Error('Angular web app and Access control should be on for this template');
  ok('designer shows Angular web app and Access control switched on');

  // ---- validation feedback ----
  await setValue(page, '#name', '');
  await bodyHas(page, 'Fix these before previewing');
  const disabled = await page.$eval('button.btn.primary[title], button.btn.primary:disabled', (b) => b.disabled).catch(() => false);
  await setValue(page, '#name', 'Enrolment System');
  await page.waitForFunction(() => !document.body.innerText.includes('Fix these before previewing'));
  ok('invalid design shows errors' + (disabled ? ' and disables Download' : '') + ', clears when fixed');

  // ---- add + remove an entity with the confirm dialog ----
  const before = await page.$$eval('.entity-head', (e) => e.length);
  await clickText(page, 'button', 'Add entity');
  await page.waitForFunction((n) => document.querySelectorAll('.entity-head').length === n + 1, {}, before);
  const heads = await page.$$('.entity-head');
  await (await heads[heads.length - 1].$('button[aria-label="Remove entity"]')).click();
  await page.waitForSelector('.dialog');
  await clickText(page, '.dialog button', 'Remove');
  await page.waitForFunction((n) => document.querySelectorAll('.entity-head').length === n, {}, before);
  ok('add entity, remove it through the confirmation dialog');

  // ---- preview: web app first ----
  await clickText(page, 'button', 'Preview');
  await page.waitForFunction(() => location.pathname.startsWith('/preview/'));
  await page.waitForSelector('.browser iframe');
  const frame = await (await page.$('.browser iframe')).contentFrame();
  await frame.waitForSelector('nav a');
  await bodyHas(frame, 'Dashboard');
  const menu = await frame.$$eval('nav a', (a) => a.map((x) => x.textContent.trim()));
  for (const want of ['Dashboard', 'Students', 'Guardians', 'Payments', 'Modules', 'Roles'])
    if (!menu.some((m) => m.includes(want))) throw new Error(`menu is missing "${want}": ${menu.join(', ')}`);
  ok('preview opens on the REAL web app with the module menu: ' + menu.join(', '));

  // ---- use the web app inside the preview ----
  await clickText(frame, 'nav a', 'Students');
  await frame.waitForFunction(() => document.querySelector('h1')?.textContent.includes('Students'));
  await bodyHas(frame, 'No records yet');
  await clickText(frame, 'a.btn', 'New Student');
  await frame.waitForSelector('#firstName');
  await setValue(frame, '#firstName', 'Tendai');
  await setValue(frame, '#lastName', 'Moyo');
  await setValue(frame, '#dateOfBirth', '2011-03-04');
  await setValue(frame, '#studentNumber', 'S100');
  await frame.click('button[type=submit]');
  await bodyHas(frame, 'Tendai');
  ok('create a student inside the preview web app');

  // ---- access control inside the preview: modules -> sub-modules -> permissions, roles ----
  const rowAction = async (row, label) => {
    const h = await frame.evaluateHandle((r, l) => {
      const tr = [...document.querySelectorAll('tbody tr')].find((t) => t.textContent.includes(r));
      return tr && [...tr.querySelectorAll('a,button')].find((b) => b.textContent.includes(l));
    }, row, label);
    const el = h.asElement();
    if (!el) throw new Error('no "' + label + '" on the row "' + row + '"');
    await el.click();
  };
  const heading = (text) => frame.waitForFunction((t) => document.querySelector('h1')?.textContent.toLowerCase().includes(t.toLowerCase()), {}, text);

  await clickText(frame, 'nav a', 'Modules');
  await heading('System modules');
  await frame.waitForSelector('tbody tr .actions-wrap a');
  await bodyHas(frame, 'Administration');
  ok('Administration > Modules lists the system modules (Data, Administration)');

  await rowAction('Data', 'View details');
  await heading('Data');
  await frame.waitForFunction(() => [...document.querySelectorAll('tbody tr')].some((t) => t.textContent.includes('Students')));
  await rowAction('Students', 'View details');
  await bodyHas(frame, 'students.view');
  ok('module -> sub-module -> permissions (students.view ...)');

  await clickText(frame, 'label.check', 'Export');
  await setValue(frame, 'input[aria-label="Other actions"]', 'Archive');
  await clickText(frame, 'button.btn.primary', 'permission');
  await bodyHas(frame, 'students.export');
  await bodyHas(frame, 'students.archive');
  ok('permissions added in bulk to the Students sub-module');

  await clickText(frame, 'nav a', 'Roles');
  await heading('Roles');
  await bodyHas(frame, 'built-in');
  await clickText(frame, 'button.btn.primary', 'Add role');
  await frame.waitForSelector('#r-name');
  await setValue(frame, '#r-name', 'Registrar');
  await clickText(frame, '.dialog button', 'Save');
  await bodyHas(frame, 'Registrar');
  await rowAction('Registrar', 'Role permission');
  await frame.waitForSelector('#permissions');
  await clickText(frame, '#menus label.check', 'Data');
  await clickText(frame, '#permissions label.check', 'View Students');
  await clickText(frame, 'button.btn.primary', 'Save menus and permissions');
  await frame.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => t.innerText.includes('Menus and permissions saved')));
  ok('created a role and assigned a menu and a permission on one page');

  await clickText(frame, 'nav a', 'Users');
  await heading('Users');
  await frame.waitForFunction(() => [...document.querySelectorAll('tbody tr')].some((t) => t.textContent.includes('teacher@example.com')));
  await bodyHas(frame, 'preview@example.com');
  await rowAction('teacher@example.com', 'Deactivate');
  await frame.waitForSelector('.dialog');
  await clickText(frame, '.dialog button', 'Deactivate');
  await frame.waitForFunction(() => [...document.querySelectorAll('tbody tr')].some((t) => t.textContent.includes('teacher@example.com') && t.textContent.includes('Deactivated')));
  ok('Users screen in the preview: listed users, deactivated one');

  // ---- other preview tabs + device switch ----
  await clickText(page, '.seg button', 'Files');
  await bodyHas(page, 'api/Controllers/StudentsController.cs');
  await clickText(page, 'button.btn', 'api/Data/DbSeeder.cs');
  await bodyHas(page, 'SystemModules');
  ok('Files tab lists generated code, including the access-control seeding');

  await clickText(page, '.seg button', 'API (Swagger)');
  await page.waitForSelector('iframe[title="API preview"]');
  ok('API tab is available next to the web app');

  await clickText(page, '.seg button', 'Web app');
  await page.waitForSelector('.browser');
  await page.click('button[aria-label="Phone"]');
  await page.waitForFunction(() => document.querySelector('.browser').getBoundingClientRect().width <= 410); // width animates
  const w = await page.$eval('.browser', (e) => e.getBoundingClientRect().width);
  if (w > 420) throw new Error('phone preview should be ~390px wide, was ' + w);
  ok('phone preview narrows the browser frame to ' + Math.round(w) + 'px');

  // ---- theme toggle ----
  await page.click('header button[aria-label^="Switch to"]');
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (!['dark', 'light'].includes(theme)) throw new Error('theme not applied');
  ok('theme toggle works (' + theme + ')');

  // ---- the School Management template: opens, previews, and ships its roles ----
  await page.goto(base + '/', { waitUntil: 'networkidle0' });
  await bodyHas(page, 'School Management');
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('School Management'));
    [...card.querySelectorAll('button')].find((b) => b.textContent.includes('Use this template')).click();
  });
  await page.waitForFunction(() => location.pathname.startsWith('/designer/'));
  await page.waitForSelector('#name');
  await page.waitForFunction(() => document.querySelectorAll('.entity-head').length === 13);
  ok('School Management template opens in the designer with its 13 entities');

  await clickText(page, 'button', 'Preview');
  await page.waitForFunction(() => location.pathname.startsWith('/preview/'));
  await page.waitForSelector('.browser iframe');
  const school = await (await page.$('.browser iframe')).contentFrame();
  await school.waitForSelector('nav a');
  await school.waitForFunction(() => document.querySelectorAll('nav a').length >= 10);
  const schoolMenu = await school.$$eval('nav a', (a) => a.map((x) => x.textContent.trim()));
  for (const want of ['Teachers', 'School Classes', 'Timetable Entries', 'Attendance Records', 'Results', 'Invoices', 'Fee Payments'])
    if (!schoolMenu.includes(want)) throw new Error('school menu is missing "' + want + '": ' + schoolMenu.join(', '));
  ok('school preview menu: ' + schoolMenu.join(', '));

  await clickText(school, 'nav a', 'Roles');
  await school.waitForFunction(() => document.querySelector('h1')?.textContent.includes('Roles'));
  await school.waitForFunction(() => ['Teacher', 'Registrar', 'Bursar'].every((r) => [...document.querySelectorAll('tbody tr')].some((t) => t.textContent.includes(r))));
  ok('the preview already has the Teacher, Registrar and Bursar roles');

  // ---- sign out: the session ends and the project is no longer reachable ----
  await page.goto(base + '/', { waitUntil: 'networkidle0' });
  await clickText(page, 'button', 'Sign out');
  await page.waitForFunction(() => location.pathname === '/login');
  const after = await page.evaluate(async (id) => {
    const codes = [];
    for (const u of ['/api/projects', '/api/projects/' + id, '/download/' + id, '/preview/' + id + '/app/entities.json'])
      codes.push((await fetch(u)).status);
    return codes;
  }, projectId);
  if (!after.every((c) => c === 401)) throw new Error('after sign-out everything must be 401, got ' + after.join(', '));
  ok('signed out: API, download and preview all answer 401');

  await page.goto(base + '/designer/' + projectId, { waitUntil: 'networkidle0' });
  if (!page.url().includes('/login')) throw new Error('a guarded page should redirect to /login');
  await setValue(page, '#email', email);
  await setValue(page, '#password', 'Str0ng!Passw0rd');
  await page.click('button[type=submit]');
  await page.waitForFunction((id) => location.pathname === '/designer/' + id, {}, projectId);
  await page.waitForSelector('#name');
  ok('signing back in returns to the page you wanted, and the project is still there');

  if (problems.length) throw new Error('browser reported errors:\n' + problems.join('\n'));
  ok('no page errors');

  console.log(`\nAll ${step} Studio browser checks passed.`);
  await cleanup(0);
} catch (e) {
  console.error('\n✘ FAILED at step ' + (step + 1) + ': ' + e.message);
  await cleanup(1);
}
