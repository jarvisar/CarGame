import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { build, createServer as createViteServer } from 'vite';

const launchOptions = {
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH }
    : process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}),
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function checkProduction(base) {
  const outDir = path.resolve('.artifacts', base === '/' ? 'pwa-root' : 'pwa-subpath');
  await build({ base, build: { outDir } });
  let update = false;
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (!pathname.startsWith(base)) { res.writeHead(404).end(); return; }
      const relative = pathname.slice(base.length) || 'index.html';
      const filename = path.resolve(outDir, relative);
      if (!filename.startsWith(`${outDir}${path.sep}`)) { res.writeHead(403).end(); return; }
      let content = await readFile(filename);
      if (relative === 'sw.js' && update) {
        content = content.toString().replace(/const VERSION = "[^"]+";/, 'const VERSION = "test-update";');
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}${base}`;
  const profile = await mkdtemp(path.resolve('.artifacts/pwa-browser-'));
  const context = await chromium.launchPersistentContext(profile, launchOptions);
  for (const page of context.pages()) await page.close();
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  try {
    let page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#loading.loaded') && document.querySelector('#error').hidden);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel=manifest]');
      return { url: link.href, data: await (await fetch(link.href)).json() };
    });
    assert.equal(manifest.data.display, 'standalone');
    assert.equal(new URL(manifest.data.start_url, manifest.url).href, url);
    for (const icon of manifest.data.icons) {
      const dimensions = await page.evaluate(async src => {
        const image = new Image(); image.src = src; await image.decode();
        return `${image.naturalWidth}x${image.naturalHeight}`;
      }, new URL(icon.src, manifest.url).href);
      assert.equal(dimensions, icon.sizes);
    }
    assert.equal(await page.locator('link[rel=apple-touch-icon]').count(), 1);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const installability = await cdp.send('Page.getInstallabilityErrors');
    assert.deepEqual(installability.installabilityErrors, [], 'Chrome installability requirements');
    await cdp.detach();

    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#loading.loaded') && document.querySelector('#error').hidden);
    // All journey assets are available even when switching for the first time offline.
    for (const journey of await page.locator('button[data-journey]').evaluateAll(buttons => buttons.map(button => button.dataset.journey))) {
      await page.locator('#change-journey').click();
      await page.locator(`button[data-journey="${journey}"]`).click();
      await page.waitForFunction(id => document.querySelector(`button[data-journey="${id}"]`).getAttribute('aria-current') === 'true' && !document.querySelector('#journey-dialog').open, journey);
      await page.waitForFunction(() => !document.querySelector('#journey-transition').classList.contains('active'));
    }
    await page.goto(`${url}?from=homescreen`);
    await page.waitForFunction(() => document.querySelector('#loading.loaded') && document.querySelector('#error').hidden);
    await page.locator('#start').click();
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => Number(document.querySelector('#speed').textContent) > 0);
    await page.keyboard.up('ArrowUp');

    await context.setOffline(false);
    await page.evaluate(() => caches.open('unrelated-app-cache'));
    const oldCache = await page.evaluate(async () => (await caches.keys()).find(name => name.startsWith('coastline:')));
    update = true;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting));
    assert.ok((await page.evaluate(() => caches.keys())).includes(oldCache), 'Active version stays cached during play');
    await page.close();
    page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(async () => {
      const names = await caches.keys();
      return names.some(name => name.endsWith(':test-update')) && names.filter(name => name.startsWith('coastline:')).length === 1;
    });
    assert.ok((await page.evaluate(() => caches.keys())).includes('unrelated-app-cache'));
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#loading.loaded') && document.querySelector('#error').hidden);
    assert.deepEqual(errors, []);
    console.log(`PASS ${base}: Chrome installability, icons, offline journeys/driving, safe updates and cache cleanup`);
  } finally {
    await context.close();
    await new Promise(resolve => server.close(resolve));
  }
}

await checkProduction('/');
await checkProduction('/coastline/');
const dev = await createViteServer({ server: { port: 0, host: '127.0.0.1' } });
try {
  await dev.listen();
  const html = await (await fetch(`http://127.0.0.1:${dev.httpServer.address().port}/`)).text();
  assert.ok(html.includes('manifest.webmanifest'));
  assert.ok(!html.includes('pwa-register.js'), 'Development never registers an offline worker');
  console.log('PASS development: manifest available, service worker registration disabled');
} finally { await dev.close(); }
