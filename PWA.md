# Install Coastline

Build with `npm run build` and deploy the entire `dist/` folder to an HTTPS host. No backend or additional packages are needed. Localhost also supports installation and offline testing via `npm run preview`.

- **iPhone / iPad:** open in Safari, tap Share, then Add to Home Screen. Leave Open as Web App enabled if shown, then tap Add.
- **Android:** open in Chrome and use the browser menu's Install app or Add to Home screen option.
- **Desktop Chrome / Edge:** use the install icon in the address bar or the browser menu's install option.

Browser wording and availability vary. Installed copies open in a standalone window with the existing touch and keyboard controls.

The welcome and pause screens include an **Add to home screen** button. When Chrome offers a native install prompt, it changes to **Install Coastline** and opens that prompt on tap. Otherwise it shows browser-menu instructions; on iPhone/iPad it explains the Share flow. Automatic browser prompts are not guaranteed, and an already installed app hides these controls.

After the initial loading screen fades, a dismissible install invitation opens on the welcome screen. **Not now** or Escape dismisses it for seven days on that browser; the existing install buttons remain available. The invitation never interrupts an already started drive or appears in standalone mode. A tap is still required to open Chrome's native installation dialog. Without a native prompt, the invitation shows the appropriate manual installation instructions.

The manifest includes real desktop (`wide`) and mobile (`narrow`) screenshots for Chrome's richer install UI. Refresh them with `node scripts/pwa-screenshots.mjs` after significant visual changes. These metadata warnings are separate from basic installation eligibility.

For phone testing, open the deployed **HTTPS** URL in Chrome directly. A local network URL such as `http://192.168.x.x:5173` is not a secure context and does not qualify for the normal PWA install flow. After deploying a new build, close all existing Coastline tabs and installed windows and reopen the site to allow a downloaded worker update to activate; a second close/reopen may be needed if the first visit downloads the update. Check Chrome's menu for **Install app** or **Add to home screen** if no automatic prompt appears.

After the first successful online load and service worker installation, the production build works offline, including all bundled journeys. Closing all app windows/tabs and reopening lets a downloaded update activate without interrupting a drive. Browser storage eviction or clearing site data requires another online visit. Journey progress retains its existing per-visit behavior.

The Vite plugin injects manifest links and registration without editing scene files or `index.html`. It generates a versioned precache from all build output, including future scene assets. Development mode does not register a worker; use a separate preview origin/port when testing production so an installed worker does not cache development pages. Serve `sw.js` with `Cache-Control: no-cache` if configuring host caching rules, and keep its URL stable. The plugin also supports a path base such as `vite build --base=/coastline/`.

Icons reuse the existing favicon road mark. Regenerate them with `node scripts/pwa-icons.mjs` (installed Chrome on Windows; otherwise Playwright Chromium, or set `CHROME_PATH`). Run `node scripts/pwa-test.mjs` to check Chrome installability, offline journey switching and driving, worker updates, subdirectory hosting, and disabled development registration. The test creates isolated builds and browser profiles under `.artifacts/`.

References: [MDN installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Apple home-screen instructions](https://support.apple.com/en-nz/guide/iphone/iphea86e5236/ios).
