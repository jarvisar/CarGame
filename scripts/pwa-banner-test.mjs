import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const script = await readFile(new URL('../public/pwa-install.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/pwa-install.css', import.meta.url), 'utf8');
const browser = await chromium.launch(process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH }
  : process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {});
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 851 }, reducedMotion: 'reduce' });
  await page.route('https://coastline.test/', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="loading"></div><div id="error" hidden></div><section id="welcome"><button id="start">Let’s drive</button></section><div id="pause-overlay" hidden></div>' }));
  async function setup() {
    await page.goto('https://coastline.test/');
    await page.evaluate(() => localStorage.clear());
    await page.clock.install();
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: script });
    await page.evaluate(() => document.querySelector('#start').addEventListener('click', () => document.querySelector('#welcome').classList.add('hidden')));
    assert.equal(await page.locator('#pwa-install-invitation').isVisible(), false, 'Hidden until loading finishes');
    await page.evaluate(() => document.querySelector('#loading').classList.add('loaded'));
    await page.locator('#pwa-install-invitation').waitFor({ state: 'visible' });
    assert.equal(await page.locator('dialog[open]').count(), 0, 'Never blocks the menu');
  }
  await setup();
  await page.clock.fastForward(8100);
  assert.equal(await page.locator('#pwa-install-invitation').isVisible(), false, 'Automatically disappears');
  await setup();
  await page.locator('#start').click();
  await page.locator('#pwa-install-invitation').waitFor({ state: 'hidden' });
  await setup();
  await page.locator('#pwa-install-invitation .pwa-install-button').focus();
  await page.clock.fastForward(9000);
  assert.equal(await page.locator('#pwa-install-invitation').isVisible(), true, 'Keyboard focus pauses dismissal');
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { window.promptCalls = (window.promptCalls || 0) + 1; };
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(event);
  });
  await page.locator('#pwa-install-invitation .pwa-install-button').click();
  assert.equal(await page.evaluate(() => window.promptCalls), 1);
  assert.equal(await page.locator('#pwa-install-invitation').isVisible(), false);
  await setup();
  await page.getByRole('button', { name: 'Dismiss install invitation' }).click();
  assert.equal(await page.locator('#pwa-install-invitation').isVisible(), false);
  for (const mode of ['standalone', 'fullscreen']) {
    await page.goto('https://coastline.test/');
    await page.evaluate(mode => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = query => query.includes(`(display-mode: ${mode})`) ? { matches: true } : original(query);
    }, mode);
    await page.addScriptTag({ content: script });
    assert.equal(await page.locator('.pwa-install, #pwa-install-invitation').count(), 0, `No installation UI in ${mode} mode`);
  }
  console.log('PASS banner: loading readiness, nonmodal menu, timed dismissal, driving dismissal, focus pause, native prompt, close button, and fullscreen/standalone suppression');
} finally { await browser.close(); }
