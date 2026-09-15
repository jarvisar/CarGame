import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const errors = [], results = [];
  for (const deviceScaleFactor of [1, 2, 3]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor, isMobile: true, hasTouch: true });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5173');
    await page.waitForFunction(() => window.__coastline && document.querySelector('#loading.loaded'));
    await page.evaluate(() => window.__coastline.action('pause'));
    const result = await page.evaluate(() => {
      const { rendering } = window.__coastline, { renderer, camera } = rendering;
      const before = renderer.getPixelRatio(), projection = camera.projectionMatrix.toArray();
      // Deterministic frame delivery exercises real buffer resizing without
      // treating headless software GPU speed as a mobile performance benchmark.
      const feed = (hz, start) => {
        rendering.recordFrame(start, false);
        for (let i = 0; i < hz * 10; i++) rendering.recordFrame(start + i * 1000 / hz, true);
      };
      feed(60, 0);
      const at60 = renderer.getPixelRatio();
      const observer = new MutationObserver(() => {});
      observer.observe(renderer.domElement, { attributes: true, attributeFilter: ['width', 'height'] });
      feed(50, 20000);
      const after = renderer.getPixelRatio(), bufferWrites = observer.takeRecords().length;
      feed(120, 40000);
      const recoveryWrites = observer.takeRecords().length;
      const width = renderer.domElement.width, height = renderer.domElement.height;
      feed(10, 60000);
      const floor = renderer.getPixelRatio(), floorWrites = observer.takeRecords().length;
      feed(10, 80000);
      const extraWrites = observer.takeRecords().length; observer.disconnect();
      renderer.render(rendering.scene, camera);
      return { before, at60, after, bufferWrites, recoveryWrites, width, height, floor, floorWrites, extraWrites,
        floorWidth: renderer.domElement.width, floorHeight: renderer.domElement.height,
        unchangedProjection: JSON.stringify(projection) === JSON.stringify(camera.projectionMatrix.toArray()) };
    });
    assert.equal(result.before, deviceScaleFactor); assert.equal(result.at60, deviceScaleFactor);
    assert.equal(result.after, { 1: 1, 2: 1.75, 3: 2.5 }[deviceScaleFactor]);
    assert.equal(result.bufferWrites, deviceScaleFactor > 1 ? 2 : 0);
    assert.equal(result.recoveryWrites, 0); assert.ok(result.unchangedProjection);
    assert.equal(result.width, Math.floor(390 * result.after)); assert.equal(result.height, Math.floor(844 * result.after));
    assert.equal(result.floor, 1); assert.equal(result.floorWrites, deviceScaleFactor > 1 ? 2 : 0);
    assert.equal(result.extraWrites, 0); assert.equal(result.floorWidth, 390); assert.equal(result.floorHeight, 844);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.querySelector('#scene').style.width === '844px');
    assert.equal(await page.evaluate(() => window.__coastline.rendering.renderer.getPixelRatio()), result.floor);
    // Confirm the main loop supplies active/inactive samples and still renders after fallback.
    await page.evaluate(() => {
      const rendering = window.__coastline.rendering, original = rendering.recordFrame;
      window.__densitySamples = [];
      rendering.recordFrame = (time, active) => { window.__densitySamples.push(active); return original(time, active); };
    });
    await page.waitForFunction(() => window.__densitySamples.includes(false));
    await page.evaluate(() => window.__coastline.action('pause'));
    await page.waitForFunction(() => window.__densitySamples.includes(true));
    results.push({ deviceScaleFactor, ...result }); await page.close();
  }
  assert.deepEqual(errors, []);
  await mkdir('.artifacts/pixel-density', { recursive: true });
  await writeFile('.artifacts/pixel-density/report.json', JSON.stringify({ passed: true, results }, null, 2));
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally { await browser.close(); }
