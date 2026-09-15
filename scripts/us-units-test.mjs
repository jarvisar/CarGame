import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  // US formatting must stay consistent even when the browser uses another locale.
  const page = await browser.newPage({ locale: 'de-DE', viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__coastline && document.querySelector('#loading.loaded'));
  assert.equal(await page.locator('html').getAttribute('lang'), 'en-US');
  assert.match(await page.locator('.speed-unit').textContent(), /^MPH/);
  assert.match(await page.locator('.location-sub').textContent(), /mi driven$/);
  await page.evaluate(() => window.__coastline.action('pause'));
  for (const [speed, distance, expectedSpeed, expectedDistance, status, fill] of [
    [0, 0, '00', '0.0', 'READY', 0],
    [13.4112, 1609.344, '30', '1.0', 'DRIVING', 47.8971],
    [-4.4704, 804.672, '10', '0.5', 'REVERSE', 15.9657],
    [28, 1986638.3616, '63', '1,234.4', 'DRIVING', 100],
  ]) {
    await page.evaluate(({ speed, distance }) => {
      Object.assign(window.__coastline.vehicle, { speed, distance });
    }, { speed, distance });
    await page.waitForFunction(({ expectedSpeed, expectedDistance }) =>
      document.querySelector('#speed').textContent === expectedSpeed &&
      document.querySelector('#distance').textContent === expectedDistance,
    { expectedSpeed, expectedDistance });
    assert.equal(await page.locator('#gear').textContent(), status);
    assert.ok(Math.abs(await page.locator('#speed-fill').evaluate(el => parseFloat(el.style.width)) - fill) < .01);
  }
  for (const id of ['desert', 'snow', 'jungle', 'coast']) {
    await page.locator('#change-journey').click();
    await page.locator(`[data-journey="${id}"]`).click();
    await page.waitForFunction(id => window.__coastline.journey === id && !window.__coastline.changingJourney, id);
    assert.equal(await page.locator('#pause-overlay .eyebrow').textContent(), await page.locator('.location-title').textContent());
    assert.equal(await page.locator('#distance').textContent(), id === 'coast' ? '1,234.4' : '0.0');
  }
  assert.deepEqual(errors, []);
  console.log('Passed: mph, miles, US number formatting, reverse speed, speed bar, and restored mileage across all routes.');
} finally {
  await browser.close();
}
