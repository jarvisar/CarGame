---
name: electron-run
description: Launch the Coastline desktop (Electron) app from source or from a packaged build, drive it with Playwright, and capture screenshots. Use when asked to run, start, open, screenshot, or check the desktop app or Electron wrapper.
---

# Run the desktop app

The desktop app is the unmodified Vite build served inside Electron (see `ELECTRON.md`). Nothing in `src/` knows about Electron, so "does it work on desktop" is a question about `electron/main.js`, the build output, and the packaging, not the game code.

## Pick a mode

| Goal | Command | Notes |
| --- | --- | --- |
| Iterate on web code inside the shell | `npm run electron:dev` | Starts Vite on a free port and opens it in Electron; edits hot-reload. `window.__coastline` is available (dev build). |
| Use the dev server that is already running | `npm run electron:dev -- --url=http://127.0.0.1:5173` | The usual local dev server. |
| Run the production build | `npm run electron:start` | Rebuilds `dist-electron/` then launches `electron .` on `app://coastline/`. No `__coastline` surface. |
| Run the packaged Windows app | `npm run electron:pack` then `release/win-unpacked/Coastline.exe` | Same code as the installer without building the installer. |

App flags can follow `--`: `--seed=4817`, `--fullscreen` / `--windowed`, `--devtools`, `--software-gl`. `--help` lists them.

Do not run `npx electron .` directly from an editor terminal: it usually exports `ELECTRON_RUN_AS_NODE=1`, which makes Electron behave as plain Node. The repo scripts strip that variable; if you must call the binary yourself, use `env -u ELECTRON_RUN_AS_NODE npx electron .`.

## Verify it automatically

```sh
npm run test:electron              # uses dist-electron/ (builds it if missing)
npm run test:electron -- --build   # rebuild dist-electron/ first (after web changes)
npm run test:electron -- --packaged  # test release/*-unpacked/ after electron:pack
```

It launches the real app with Playwright, checks the shell's responsibilities (served over `app://`, worker running, secure context, install UI hidden, no service worker, keyboard driving, F fullscreen, F11 window fullscreen, all routes), and writes `.artifacts/electron/welcome.png`, `coast.png`, `desert.png`, `snow.png`, and `report.json`. Read the screenshots when a visual check matters.

## Drive it yourself with Playwright

Scripts must live inside the repo (for example under `.artifacts/`) so `@playwright/test` resolves. Template:

```js
import { _electron as electron } from '@playwright/test';
const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env;
const app = await electron.launch({
  args: ['.', '--windowed', '--seed=4817'],
  env: { ...env, COASTLINE_USER_DATA: '.artifacts/electron/user-data' },   // isolated profile
  // env: { ...env, COASTLINE_DEV_URL: 'http://127.0.0.1:5173/' },          // dev server instead of dist-electron/
});
const page = await app.firstWindow();
await page.waitForFunction(() => document.querySelector('#loading.loaded') && document.querySelector('#error')?.hidden);
await page.screenshot({ path: '.artifacts/electron/my-shot.png' });
await app.close();
```

- `page.keyboard` reaches the game (W, P, F, N, V) but bypasses Electron's `before-input-event`. To exercise shell shortcuts (F11, Alt+Enter, F12) use `webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F11' })` through `app.evaluate(({ BrowserWindow }) => ...)`.
- Native window state comes from `app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())`.
- Main-process `console.log` output appears in the terminal that launched the app.
- Fixed seeds and spots for comparable screenshots are described in the project memory note on screenshot tooling; the same `?seed=` and `vehicle.s` recipe works here in dev mode.

## Where things live

- `electron/main.js`: window, `app://` protocol, flags, shortcuts, menu. `electron/window-state.js`: remembered bounds.
- Profile and window state: `%APPDATA%\Coastline` (Windows), `~/.config/Coastline` (Linux), `~/Library/Application Support/Coastline` (macOS). Delete `window-state.json` there to reset the window.
- A missing `dist-electron/` shows an error dialog naming the fix (`npm run electron:web`).
