---
name: electron-sync
description: Check that the Electron desktop wrapper still matches the web app after web changes, and update the wrapper, its smoke test, or its docs when a shared touchpoint moved. Use after editing index.html, public/, vite.config.js, scripts/pwa-plugin.mjs, input or fullscreen handling, or before a desktop release.
---

# Keep the desktop wrapper in sync

The wrapper ships the web app's own `vite build` output, so most web changes need nothing. This skill is about the short list of things the wrapper *does* assume, and the checks that prove nothing drifted.

## 1. Run the checks

```sh
npm run test:electron -- --build      # rebuild dist-electron/ from current sources and smoke-test the shell
```

Then look at `.artifacts/electron/*.png` and `report.json`. Before a release also run `npm run electron:pack && npm run test:electron -- --packaged`. CI runs the same smoke test on every push (`.github/workflows/desktop.yml`), so a red "Desktop app" workflow after a web change means a touchpoint below moved.

## 2. Touchpoints between the web app and the wrapper

| Web-app side | Used by | If it changes |
| --- | --- | --- |
| `vite build` output: `index.html` at the root, absolute `/assets/...` URLs (base `/`), module worker under `assets/` | `electron/main.js` `app://` handler; `npm run electron:web` | Keep `vite build --outDir dist-electron` valid with the default base. A new `base` or `outDir` in `vite.config.js` needs a matching change in `rendererDir` / the npm script. |
| `public/manifest.webmanifest` (`short_name`, `description`, `background_color`) | `electron/builder.config.cjs` (product name, artifact names), `main.js` (window title, background) | Nothing to do; a renamed `short_name` renames the packages and the profile folder. `appId` stays fixed on purpose. |
| `public/favicon.svg` | `electron/build/icon.png` (generated) | Run `npm run electron:icons` and commit the PNG. |
| Web-only script names `pwa-register.js`, `pwa-install.js` (injected by `scripts/pwa-plugin.mjs`) | `WEB_ONLY_SCRIPTS` in `main.js` (served as empty scripts) | Rename or add web-only scripts there too, otherwise install banners or a service worker appear on desktop. |
| DOM hooks `#loading.loaded`, `#error[hidden]`, `#welcome.hidden`, `#distance`, `#pause-overlay`, `#journey-transition.active`, `body[data-journey]`, `button[data-journey]` | `scripts/electron-test.mjs` | Update the selectors in the smoke test. |
| Keys W / P / F / N and the `?seed=` URL parameter | smoke test; `--seed` flag in `main.js` | Update the test; keep `--seed` mapping to the URL parameter. |
| HTML fullscreen (`requestFullscreen` on F / LB) | Electron maps it to the native window automatically | Nothing. F11 and Alt+Enter are shell-level extras handled in `main.js`. |
| Storage (`localStorage`, session storage) | Works on the `app://` origin | Nothing; the profile lives in the user-data folder. |
| Static files in `public/` with a new extension | MIME table in `main.js` | Add the extension, or the file is served as `application/octet-stream`. |
| New browser capabilities (pointer lock, clipboard, notifications, file pickers, camera) | Electron permission defaults | Add a `session.setPermissionRequestHandler` in `main.js` if the API prompts or is denied. Gamepad, Web Audio, and WebGL need nothing. |
| External links or `window.open` | Denied in-app, opened in the system browser | Intentional; keep it. |
| `package.json` `version` | App version, installer names, release tag | Bump with `npm version patch|minor|major` (creates the `vX.Y.Z` tag CI releases from). |
| Electron or electron-builder upgrade | `devDependencies` | Run the smoke test and `npm run electron:pack`; read the Electron breaking-changes list for `protocol.handle`, `sandbox`, and ESM main-process changes. |

## 3. When something moved

1. Fix the wrapper side (`electron/main.js`, `electron/builder.config.cjs`) or the smoke test (`scripts/electron-test.mjs`), never the web app, unless the web app is genuinely broken.
2. Re-run `npm run test:electron -- --build`.
3. Update `ELECTRON.md` (flags, behaviour, Steam Deck notes) and this table if the contract itself changed.
4. Mention the desktop impact in the commit message so the release notes pick it up.

## 4. Things that are not drift

- Bigger bundles or new assets under `dist-electron/assets/`: packaged automatically.
- New routes, cars, scenery, audio: covered by the route-cycling part of the smoke test.
- Touch-only UI: hidden on desktop by the web app's own media queries, as in a browser.
- The service worker `sw.js` is still built and packaged but never registered on desktop; that is expected.
