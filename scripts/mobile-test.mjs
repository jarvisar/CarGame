import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('.artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('coastline-install-dismissed-v2', String(Date.now())));
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__coastline && document.querySelector('#loading').classList.contains('loaded'));
  await page.waitForTimeout(700);
  async function checkLayout(name) {
    const issues = await page.evaluate(() => {
      const failures = [];
      const selectors = ['#sound', '#pause', '#change-journey', '#view', '#reset', '#touch-stick'];
      const rects = selectors.map(selector => ({ selector, rect: document.querySelector(selector).getBoundingClientRect() }));
      for (const { selector, rect } of rects) {
        if (rect.width < 44 || rect.height < 44) failures.push(`${selector} has a small touch target`);
        if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1) failures.push(`${selector} is outside viewport`);
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        if (!document.querySelector(selector).contains(hit)) failures.push(`${selector} is covered by ${hit?.outerHTML.slice(0, 100)}`);
      }
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (Math.min(a.rect.right, b.rect.right) > Math.max(a.rect.left, b.rect.left) && Math.min(a.rect.bottom, b.rect.bottom) > Math.max(a.rect.top, b.rect.top)) failures.push(`${a.selector} overlaps ${b.selector}`);
      }
      if (document.documentElement.scrollWidth > innerWidth) failures.push('horizontal overflow');
      return failures;
    });
    assert.deepEqual(issues, [], name);
    checks.push(name);
  }
  for (const [width, height] of [[390, 844], [320, 568], [360, 640], [430, 932], [667, 375], [844, 390], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    await checkLayout(`welcome ${width}x${height}`);
    await page.locator('#start').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.artifacts/mobile-welcome-${width}.png` });
    await page.locator('#change-journey').tap();
    await page.locator('[data-journey=snow].journey-card').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('[data-journey=snow].journey-card').isVisible());
    assert.ok(await page.locator('#journey-dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.screenshot({ path: `.artifacts/mobile-journeys-${width}.png` });
    await page.locator('#close-journeys').tap();
    await page.waitForFunction(() => !window.__coastline.paused);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#start').tap();
  await page.waitForTimeout(1000);
  const client = await page.context().newCDPSession(page);
  const point = async selector => { const r = await page.locator(selector).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const center = { ...await point('#touch-stick'), id: 1 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
  await frames();
  assert.equal(await page.evaluate(() => window.__coastline.vehicle.speed), 0, 'touching the center does not accelerate');
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...center, y: center.y - 36 }] });
  await page.waitForFunction(() => window.__coastline.vehicle.speed > 3);
  assert.ok(await page.evaluate(() => window.__coastline.input.state.touchStick.y > .9));
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...center, x: center.x + 160 }] });
  await frames();
  assert.equal(await page.evaluate(() => window.__coastline.input.state.touchStick.x), 1, 'pointer capture tracks drags beyond the stick');
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForFunction(() => window.__coastline.vehicle.speed === 0);
  assert.deepEqual(await page.evaluate(() => window.__coastline.input.state.touchStick), { x: 0, y: 0 });
  checks.push('joystick deadzone, drag outside bounds, touch cancellation and stopping');
  async function frames() { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, y: center.y - 30 }] });
  await frames();
  // A second finger can pause without taking over the joystick's pointer.
  const pausePoint = { ...await point('#pause'), id: 2 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, y: center.y - 30 }, pausePoint] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pausePoint] });
  await page.waitForFunction(() => window.__coastline.paused);
  assert.equal(await page.evaluate(() => window.__coastline.input.touchStick.engaged), false);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.locator('#resume').tap();
  assert.equal(await page.evaluate(() => window.__coastline.input.state.touchStick), undefined);
  checks.push('second-finger pause clears joystick and prevents stale input on resume');
  for (const [width, height] of [[390, 844], [320, 568], [667, 375], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await checkLayout(`driving ${width}x${height}`);
    await page.screenshot({ path: `.artifacts/mobile-driving-${width}.png` });
    await page.locator('#pause').tap();
    await page.locator('#resume').tap();
    assert.equal(await page.evaluate(() => window.__coastline.paused), false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const journey of ['desert', 'snow']) {
    await page.locator('#change-journey').tap();
    await page.locator(`.journey-card[data-journey=${journey}]`).tap();
    await page.waitForFunction(id => window.__coastline.journey === id && !window.__coastline.changingJourney, journey);
    await checkLayout(`${journey} touch controls`);
    await page.screenshot({ path: `.artifacts/mobile-${journey}-ui.png` });
  }
  await page.evaluate(() => {
    for (const [side, value] of Object.entries({ top: 44, bottom: 34, left: 0, right: 0 })) document.documentElement.style.setProperty(`--safe-${side}`, `${value}px`);
  });
  await checkLayout('portrait safe area');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    for (const [side, value] of Object.entries({ top: 0, bottom: 21, left: 44, right: 44 })) document.documentElement.style.setProperty(`--safe-${side}`, `${value}px`);
  });
  await checkLayout('landscape safe area');
  assert.deepEqual(errors, []);
  await writeFile('.artifacts/mobile-report.json', JSON.stringify({ passed: true, checks }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally { await browser.close(); }
