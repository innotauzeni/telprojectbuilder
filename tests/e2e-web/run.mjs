// End-to-end browser test for a GENERATED system.
//
//   PB_EMIT=<dir> dotnet test tests/ProjectBuilder.Generator.Tests --filter Category=Manual   (writes the Enrolment system)
//   (cd <dir>/web && npm install && npm run build)
//   node run.mjs <dir>            (needs Chrome/Edge; set CHROME_PATH if it is not found)
//
// It starts the generated API, serves the built Angular app with /api proxied to it (like the generated nginx does),
// then clicks through the UI in a real browser.
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const dir = resolve(process.argv[2] ?? '');
if (!existsSync(join(dir, 'api', 'appsettings.json'))) fail('usage: node run.mjs <generated-project-dir>');
const dist = join(dir, 'web', 'dist', 'web', 'browser');
if (!existsSync(join(dist, 'index.html'))) fail(`web app not built: run "npm install && npm run build" in ${join(dir, 'web')}`);

const chromePath = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));
if (!chromePath) fail('Chrome/Edge not found. Set CHROME_PATH.');

const settings = JSON.parse(readFileSync(join(dir, 'api', 'appsettings.json'), 'utf8'));
const adminEmail = settings.Seed.AdminEmail;
const adminPassword = settings.Seed.AdminPassword;
// Chrome refuses some ports (6000, 6665-6669, 6697, ...); stay in 5400-5799.
const apiPort = 5400 + Math.floor(Math.random() * 200);
const webPort = apiPort + 200;

function fail(msg) { console.error(msg); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 0;
const ok = (msg) => console.log(`  ✔ ${++step}. ${msg}`);

// ---- 1. start the generated API (always from an empty SQLite database) ----
for (const f of ['app.db', 'app.db-shm', 'app.db-wal']) rmSync(join(dir, 'api', f), { force: true });
const api = spawn('dotnet', ['run', '--no-launch-profile', '--urls', `http://127.0.0.1:${apiPort}`],
  { cwd: join(dir, 'api'), stdio: 'ignore' });
let apiExited = false;
api.on('exit', () => { apiExited = true; });

// ---- 2. static server for the Angular build, proxying /api ----
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ico': 'image/x-icon' };
const web = createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const p = httpRequest({ host: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: req.headers },
      (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(p);
    return;
  }
  const rel = decodeURIComponent(req.url.split('?')[0]);
  let file = resolve(dist, '.' + rel);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html'); // SPA fallback
  res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(webPort, '127.0.0.1');

let browser, page;
async function cleanup(code) {
  try { await browser?.close(); } catch { /* ignore */ }
  web.close();
  try { api.kill(); } catch { /* ignore */ }
  // `dotnet run` spawns the app as a child; make sure it is gone on Windows too.
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(api.pid), '/T', '/F'], { stdio: 'ignore' });
  setTimeout(() => process.exit(code), 500);
}

try {
  // wait for the API
  for (let i = 0; ; i++) {
    if (apiExited) throw new Error('generated API exited early');
    try { if ((await fetch(`http://127.0.0.1:${apiPort}/swagger/v1/swagger.json`)).ok) break; } catch { /* not yet */ }
    if (i > 240) throw new Error('API did not start in 4 minutes');
    await sleep(1000);
  }
  ok('generated API is up');

  browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.setDefaultTimeout(15000);
  await page.setViewport({ width: 1366, height: 900 }); // desktop layout (below 900px the sidebar becomes a drawer)
  const base = `http://127.0.0.1:${webPort}`;

  const text = async (sel) => page.$eval(sel, (e) => e.textContent ?? '');
  const bodyHas = async (s) => page.waitForFunction((t) => document.body.innerText.includes(t), {}, s);
  const setValue = async (sel, value) => page.$eval(sel, (el, v) => {
    el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  const goTo = async (label) => { // click a menu entry and wait until that section has rendered
    await clickText('nav a', label);
    await page.waitForFunction((l) => document.querySelector('h1')?.textContent.toLowerCase().includes(l.toLowerCase()), {}, label);
  };
  const clickLabel = async (label) => { await page.waitForSelector(`[aria-label="${label}"]`); await page.click(`[aria-label="${label}"]`); };
  const clickTextExists = async (selector, label) =>
    !!(await page.evaluateHandle((s, l) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(l)), selector, label)).asElement();
  const clickText = async (selector, label) => {
    const h = await page.evaluateHandle((s, l) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(l)), selector, label);
    const el = h.asElement();
    if (!el) throw new Error(`no ${selector} containing "${label}"`);
    await el.click();
  };

  // ---- login ----
  await page.goto(base + '/', { waitUntil: 'networkidle0' });
  if (!page.url().endsWith('/login')) throw new Error('unauthenticated visit should redirect to /login, got ' + page.url());
  ok('unauthenticated visit redirects to the login page');

  await setValue('#email', adminEmail);
  await setValue('#password', 'wrong-password');
  await page.click('button[type=submit]');
  await bodyHas('Invalid email or password');
  ok('wrong password shows an error');

  await setValue('#password', adminPassword);
  await page.click('button[type=submit]');
  await bodyHas('Students');
  ok('admin can log in and sees the menu');
  await page.waitForFunction(() => [...document.querySelectorAll('nav a')].some((a) => a.textContent.includes('Dashboard'))); // menu loads after login
  const adminMenu = await page.$$eval('nav a', (a) => a.map((x) => x.textContent.trim()));
  for (const want of ['Dashboard', 'Students', 'Guardians', 'Modules', 'Roles'])
    if (!adminMenu.includes(want)) throw new Error('admin menu is missing "' + want + '": ' + adminMenu.join(', '));
  const groups = await page.$$eval('nav .group', (g) => g.map((x) => x.textContent.trim()));
  if (!groups.includes('Data') || !groups.includes('Administration')) throw new Error('menu groups missing: ' + groups.join(', '));
  ok('admin sees the module menu (groups: ' + groups.join(', ') + ') with sub-modules: ' + adminMenu.join(', '));

  // a second, non-admin user for the role checks at the end
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('session')));
  const reg = await fetch(`http://127.0.0.1:${apiPort}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.token },
    body: JSON.stringify({ email: 'clerk@example.com', password: 'Clerk#12345', role: 'User' })
  });
  if (reg.status !== 201) throw new Error('could not create the User account: ' + reg.status);

  // ---- create a student ----
  await goTo('Students');
  await bodyHas('No records yet');
  await clickText('a.btn', 'New Student');
  await page.waitForSelector('#firstName');
  await page.click('button[type=submit]'); // empty -> browser/Angular blocks or API returns 400; must NOT create anything
  await sleep(500);
  await setValue('#firstName', 'Ann');
  await setValue('#lastName', 'Moyo');
  await setValue('#dateOfBirth', '2010-05-01');
  await setValue('#studentNumber', 'S001');
  await page.click('button[type=submit]');
  await bodyHas('Ann');
  ok('create student: appears in the list');

  // ---- edit it (form must be pre-filled from the server) ----
  await clickLabel('Edit');
  await page.waitForSelector('#firstName');
  await page.waitForFunction(() => document.querySelector('#firstName').value === 'Ann');
  const dob = await page.$eval('#dateOfBirth', (e) => e.value);
  if (dob !== '2010-05-01') throw new Error('date not pre-filled: ' + dob);
  ok('edit form is pre-filled (text + date)');
  await setValue('#lastName', 'Ndlovu');
  await page.click('button[type=submit]');
  await bodyHas('Ndlovu');
  ok('edit student: change is saved and shown');

  // ---- duplicate unique value -> readable error ----
  await clickText('a.btn', 'New Student');
  await page.waitForSelector('#firstName');
  await setValue('#firstName', 'Bob');
  await setValue('#lastName', 'Dube');
  await setValue('#dateOfBirth', '2011-01-01');
  await setValue('#studentNumber', 'S001');
  await page.click('button[type=submit]');
  await bodyHas('unique value is duplicated');
  ok('duplicate student number shows a readable error');

  // ---- relation: guardian linked to the student, shown by name ----
  await goTo('Guardians');
  await clickText('a.btn', 'New Guardian');
  await page.waitForSelector('#studentId');
  await page.waitForFunction(() => document.querySelectorAll('#studentId option').length > 1);
  await setValue('#fullName', 'Mr Ndlovu');
  await setValue('#phone', '0770000000');
  await page.select('#studentId', await page.$eval('#studentId option:nth-child(2)', (o) => o.value)).catch(async () => {
    // Angular's [ngValue] options use "0: <id>" style values; fall back to selecting by index
    await page.$eval('#studentId', (s) => { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); });
  });
  await page.click('button[type=submit]');
  await bodyHas('Mr Ndlovu');
  await bodyHas('Ann'); // the Student column shows the student's first name, not a GUID
  ok('guardian linked to a student shows the student by name');

  // ---- delete as admin ----
  await goTo('Guardians');
  await bodyHas('Mr Ndlovu');
  await clickLabel('Delete');
  await page.waitForSelector('.dialog');
  await clickText('.dialog button', 'Delete');
  await bodyHas('No records yet');
  ok('admin can delete a record');

  // ---- administration: modules, sub-modules, permissions and roles through the UI ----
  await goTo('Modules');
  await bodyHas('Administration');
  await page.waitForSelector('tbody tr .actions-wrap a');
  const actions = await page.$$eval('tbody tr:first-child .actions-wrap a', (a) => a.map((x) => x.textContent.trim()));
  if (!actions.some((a) => a.includes('View details')) || !actions.some((a) => a.includes('Menu permission')))
    throw new Error('module row actions missing: ' + actions.join(' | '));
  ok('modules table has View details and Menu permission actions');

  const rowAction = async (rowText, label) => {
    const h = await page.evaluateHandle((r, l) => {
      const row = [...document.querySelectorAll('tbody tr')].find((t) => t.textContent.includes(r));
      return row && [...row.querySelectorAll('a,button')].find((b) => b.textContent.includes(l));
    }, rowText, label);
    const el = h.asElement();
    if (!el) throw new Error('no "' + label + '" action on the row "' + rowText + '"');
    await el.click();
  };

  await rowAction('Data', 'View details');
  await page.waitForFunction(() => document.querySelector('h1')?.textContent.includes('Data'));
  await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].some((t) => t.textContent.includes('Students'))); // sub-modules table loaded
  await rowAction('Students', 'View details');
  await bodyHas('students.view');
  await bodyHas('students.delete');
  ok('module -> sub-module -> its permissions (students.view ... students.delete)');

  // add menu permissions in bulk: tick Export, type two more
  await clickText('label.check', 'Export');
  await setValue('input[aria-label="Other actions"]', 'Archive, Send Email');
  await clickText('button.btn.primary', 'permission');
  await bodyHas('students.export');
  await bodyHas('students.send-email');
  await bodyHas('students.archive');
  ok('bulk-added permissions Export, Archive and Send Email to the Students sub-module');

  await goTo('Roles');
  await bodyHas('built-in');
  await clickText('button.btn.primary', 'Add role');
  await page.waitForSelector('#r-name');
  await setValue('#r-name', 'Registrar');
  await setValue('#r-type', 'Staff');
  await clickText('.dialog button', 'Save');
  await bodyHas('Registrar');
  ok('created the Registrar role');

  await rowAction('Registrar', 'Role permission');
  await page.waitForSelector('#permissions');
  await clickText('#menus label.check', 'Data');
  await clickText('#permissions label.check', 'View Students');
  await page.waitForFunction(() => !document.querySelector('.toast')); // let earlier toasts clear so we read this one
  await clickText('button.btn.primary', 'Save menus and permissions');
  await page.waitForSelector('.toast');
  const savedToast = await page.$eval('.toast', (e) => e.innerText);
  if (!savedToast.includes('Menus and permissions saved')) throw new Error('saving the role failed: ' + savedToast);
  ok('assigned the Data menu and the View Students permission to Registrar on one page');

  await page.goto(base + '/admin/roles', { waitUntil: 'networkidle0' });
  await rowAction('Registrar', 'View details');
  await bodyHas('View Students');
  ok('role details show the assigned menu and permission');

  const regRes = await fetch(`http://127.0.0.1:${apiPort}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.token },
    body: JSON.stringify({ email: 'registrar@example.com', password: 'Regist#12345', role: 'Registrar' })
  });
  if (regRes.status !== 201) throw new Error('could not create the Registrar user: ' + regRes.status);

  // ---- users: deactivate (sign-in explains why), reactivate, add a user, change roles ----
  await goTo('Users');
  const userRow = (email, extra = '') => page.waitForFunction((e, x) => [...document.querySelectorAll('tbody tr')].some((t) => t.textContent.includes(e) && t.textContent.includes(x)), {}, email, extra);
  await userRow('registrar@example.com', 'Active');
  await rowAction('registrar@example.com', 'Deactivate');
  await page.waitForSelector('.dialog');
  await clickText('.dialog button', 'Deactivate');
  await userRow('registrar@example.com', 'Deactivated');
  ok('deactivated a user from the Users table');

  const other = await browser.createBrowserContext(); // a second, signed-out browser
  const p2 = await other.newPage();
  await p2.setViewport({ width: 1366, height: 900 });
  await p2.goto(base + '/login', { waitUntil: 'networkidle0' });
  await p2.type('#email', 'registrar@example.com');
  await p2.type('#password', 'Regist#12345');
  await p2.click('button[type=submit]');
  await p2.waitForFunction(() => document.body.innerText.includes('deactivated'));
  await other.close();
  ok('a deactivated user is told at sign-in that the account is deactivated');

  await rowAction('registrar@example.com', 'Activate');
  await userRow('registrar@example.com', 'Active');
  await page.waitForFunction(() => ![...document.querySelectorAll('tbody tr')].some((t) => t.textContent.includes('registrar@example.com') && t.textContent.includes('Deactivated')));
  ok('reactivated the user');

  await clickText('button.btn.primary', 'Add user');
  await page.waitForSelector('#u-email');
  await setValue('#u-email', 'intern@example.com');
  await setValue('#u-pass', 'Intern#12345');
  await clickText('.dialog button', 'Save');
  await userRow('intern@example.com', 'User');
  await rowAction('intern@example.com', 'Roles');
  await page.waitForSelector('.dialog .check');
  await clickText('.dialog label.check', 'Registrar');
  await clickText('.dialog button', 'Save');
  await userRow('intern@example.com', 'Registrar');
  ok('added a user and gave them the Registrar role');

  // ---- logout ----
  await clickLabel('Log out');
  await page.waitForFunction(() => location.pathname === '/login');
  await page.goto(base + '/e/students', { waitUntil: 'networkidle0' });
  if (!page.url().endsWith('/login')) throw new Error('after logout, protected pages must redirect to /login');
  ok('after logout, protected pages redirect to login');

  // ---- a plain User: smaller menu, no admin screens ----
  await setValue('#email', 'clerk@example.com');
  await setValue('#password', 'Clerk#12345');
  await page.click('button[type=submit]');
  await page.waitForSelector('nav a');
  await bodyHas('Students');
  await page.waitForFunction(() => [...document.querySelectorAll('nav a')].some((a) => a.textContent.includes('Dashboard')));
  const clerkMenu = await page.$$eval('nav a', (a) => a.map((x) => x.textContent.trim()));
  if (clerkMenu.includes('Modules') || clerkMenu.includes('Roles')) throw new Error('a User must not see Administration: ' + clerkMenu.join(', '));
  if (!clerkMenu.includes('Students')) throw new Error('a User should see Students: ' + clerkMenu.join(', '));
  ok('a User gets a smaller menu without Administration: ' + clerkMenu.join(', '));
  await page.goto(base + '/admin/modules', { waitUntil: 'networkidle0' });
  if (new URL(page.url()).pathname !== '/') throw new Error('a User opening Administration should be sent home, got ' + page.url());
  ok('a User opening an Administration screen is sent back to the dashboard');
  await page.goto(base + '/e/students', { waitUntil: 'networkidle0' });
  await bodyHas('Ndlovu');
  if (await page.$('[aria-label="Delete"]')) throw new Error('a User (no students.delete) must not see the Delete button');
  ok('a User has no Delete button (the User role lacks students.delete)');
  await clickLabel('Log out');

  // ---- the custom Registrar role: only what it was given ----
  await setValue('#email', 'registrar@example.com');
  await setValue('#password', 'Regist#12345');
  await page.click('button[type=submit]');
  await page.waitForFunction(() => [...document.querySelectorAll('nav a')].some((a) => a.textContent.includes('Students')));
  await sleep(800); // let the menu finish loading for this user
  const regMenu = await page.$$eval('nav a', (a) => a.map((x) => x.textContent.trim()));
  if (regMenu.includes('Guardians') || regMenu.includes('Roles')) throw new Error('Registrar should only see Students: ' + regMenu.join(', '));
  ok('Registrar sees only Dashboard and Students: ' + regMenu.join(', '));
  await page.goto(base + '/e/students', { waitUntil: 'networkidle0' });
  await bodyHas('Ndlovu');
  if (await clickTextExists('a.btn', 'New Student')) throw new Error('Registrar (no students.create) must not see New Student');
  if (await page.$('[aria-label="Edit"]') || await page.$('[aria-label="Delete"]')) throw new Error('Registrar must not see Edit or Delete');
  await page.waitForSelector('[aria-label="View details"]');
  ok('Registrar can view students but has no New, Edit or Delete buttons');
  await clickLabel('View details');
  await page.waitForSelector('#firstName');
  if (!(await page.$eval('#firstName', (e) => e.matches(':disabled')))) throw new Error('the record should open read-only');
  ok('a record opens read-only without the Edit permission');
  await clickLabel('Log out');

  const real = problems.filter((p) => !['400', '401', '403', '409'].some((c) => p.includes(c)));
  if (real.length) throw new Error('browser reported errors:\n' + real.join('\n'));
  ok('no unexpected browser console errors');

  console.log(`\nAll ${step} browser checks passed.`);
  await cleanup(0);
} catch (e) {
  console.error('\n✘ FAILED at step ' + (step + 1) + ': ' + e.message);
  try { console.error('--- toasts: ' + JSON.stringify(await page.$$eval('.toast', (t) => t.map((x) => x.innerText)))); } catch { /* page gone */ }
  try { console.error('--- page at failure: ' + page?.url() + String.fromCharCode(10) + (await page.evaluate(() => document.body.innerText)).slice(0, 700)); } catch { /* page gone */ }
  await cleanup(1);
}
