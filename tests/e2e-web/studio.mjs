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
  const menuTile = tiles.find((t) => t.text.includes('Dynamic menu'));
  const webTile = tiles.find((t) => t.text.includes('Angular web app'));
  if (!menuTile?.on || !webTile?.on) throw new Error('Angular web app and Dynamic menu should be on for this template');
  ok('designer shows Angular web app and Dynamic menu switched on');

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
  for (const want of ['Dashboard', 'Students', 'Guardians', 'Payments', 'Menu'])
    if (!menu.some((m) => m.includes(want))) throw new Error(`menu is missing "${want}": ${menu.join(', ')}`);
  ok('preview opens on the REAL web app with the dynamic menu: ' + menu.join(', '));

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

  // ---- dynamic menu editing in the preview ----
  await clickText(frame, 'nav a', 'Menu');
  await frame.waitForSelector('input[aria-label="Label"]');
  await frame.waitForFunction(() => document.querySelectorAll('input[aria-label="Label"]').length >= 8);
  const labels = await frame.$$eval('input[aria-label="Label"]', (i) => i.map((x) => x.value));
  const idx = labels.indexOf('Students');
  if (idx < 0) throw new Error('menu editor does not list Students: ' + labels.join(', '));
  const inputs = await frame.$$('input[aria-label="Label"]');
  await inputs[idx].click({ clickCount: 3 });
  await inputs[idx].type('Learners');
  const rows = await frame.$$('tbody tr');
  await (await rows[idx].$('button.btn.primary')).click();
  await frame.waitForFunction(() => [...document.querySelectorAll('nav a')].some((a) => a.textContent.includes('Learners')));
  ok('rename a menu entry in the Menu editor: sidebar updates immediately');

  // hide an entry
  const rows2 = await frame.$$('tbody tr');
  const guardianIdx = (await frame.$$eval('input[aria-label="Label"]', (i) => i.map((x) => x.value))).indexOf('Guardians');
  await (await rows2[guardianIdx].$('input[type=checkbox]')).click();
  await (await rows2[guardianIdx].$('button.btn.primary')).click();
  await frame.waitForFunction(() => ![...document.querySelectorAll('nav a')].some((a) => a.textContent.includes('Guardians')));
  ok('hide a menu entry: it disappears from the sidebar');

  // ---- other preview tabs + device switch ----
  await clickText(page, '.seg button', 'Files');
  await bodyHas(page, 'api/Controllers/StudentsController.cs');
  await clickText(page, 'button.btn', 'api/Data/DbSeeder.cs');
  await bodyHas(page, 'MenuItems');
  ok('Files tab lists generated code, including the MenuItems seeding');

  await clickText(page, '.seg button', 'API (Swagger)');
  await page.waitForSelector('iframe[title="API preview"]');
  ok('API tab is available next to the web app');

  await clickText(page, '.seg button', 'Web app');
  await page.waitForSelector('.browser');
  await page.click('button[aria-label="Phone"]');
  await page.waitForFunction(() => document.querySelector('.browser').getBoundingClientRect().width < 420); // width animates
  const w = await page.$eval('.browser', (e) => e.getBoundingClientRect().width);
  if (w > 420) throw new Error('phone preview should be ~390px wide, was ' + w);
  ok('phone preview narrows the browser frame to ' + Math.round(w) + 'px');

  // ---- theme toggle ----
  await page.click('header button[aria-label^="Switch to"]');
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (!['dark', 'light'].includes(theme)) throw new Error('theme not applied');
  ok('theme toggle works (' + theme + ')');

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
