---
name: electron-build
description: Build Coastline desktop packages (Windows installer and portable exe, Linux AppImage for Steam Deck, macOS dmg and zip) locally or through GitHub Actions, verify them, and cut a tagged release. Use when asked to build, package, ship, or release the desktop or Electron app, or to produce a Steam Deck or Mac build.
---

# Build and release the desktop app

Packages are produced by electron-builder from `electron/builder.config.cjs`; the renderer is rebuilt into `dist-electron/` by every build script. Output lands in `release/` (git-ignored).

## Local builds

| Command | Produces | Where it works |
| --- | --- | --- |
| `npm run electron:pack` | `release/win-unpacked/` (no installer, fastest check) | Any host, for that host |
| `npm run electron:build:win` | `Coastline-<v>-win-x64-setup.exe` (NSIS, per-user, custom dir), `Coastline-<v>-win-x64-portable.exe` | Windows (also Linux/macOS with Wine) |
| `npm run electron:build:linux` | `Coastline-<v>-linux-x86_64.AppImage` | Linux, WSL, CI. From Windows only the staging works (`--linux --dir` gives `release/linux-unpacked/`); the AppImage step needs `mksquashfs`, which electron-builder ships for Linux/macOS only |
| `npm run electron:build:mac` | `Coastline-<v>-mac-{x64,arm64}.dmg` and `.zip` | macOS only (CI) |
| `npm run electron:build` | The host OS's default targets | Any |

After a local build, verify the unpacked app with `npm run test:electron -- --packaged`, then launch the installer or AppImage by hand if the change touched packaging.

Windows host note: electron-builder normally extracts Electron into `release/*.tmp` and renames it, and this machine makes that rename fail with `EPERM` for several minutes (see the project memory). The config sidesteps it on Windows hosts by copying already unpacked Electron (`node_modules/electron/dist` for Windows targets, a bsdtar extraction of the official zip cached under `node_modules/.cache/coastline-electron/` for others). Do not "fix" this by editing node_modules or adding retries; build the other platforms on CI or in WSL with a separate checkout (`git clone` inside WSL, `npm ci`, `npm run electron:build:linux`).

## Release through GitHub Actions

`.github/workflows/desktop.yml` builds all three platforms, smoke-tests each unpacked build, and attaches the installers to a GitHub release when a `v*` tag is pushed. It also runs the smoke test on every push and pull request.

```sh
npm version patch      # or minor / major: bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
```

Then watch the "Desktop app" workflow (`gh run watch` or the Actions tab). The release appears at github.com/jarvisar/CarGame/releases with notes generated from commits. A `workflow_dispatch` run builds the same packages as downloadable workflow artifacts without publishing a release.

The web deployment workflow is separate (`main.yml`) and unaffected by tags.

## Signing and first-run warnings

Everything is unsigned by design (no certificates in the repo or CI):

- Windows SmartScreen: "Windows protected your PC" → *More info* → *Run anyway*.
- macOS Gatekeeper: right-click → *Open*, or `xattr -cr /Applications/Coastline.app`. Cannot be tested here; the macOS CI smoke test is the only macOS verification.
- Linux: `chmod +x Coastline-*.AppImage`. If Electron's sandbox cannot start on a distribution without unprivileged user namespaces, launch with `--no-sandbox`.

To add signing later, set `win.certificateFile`/`CSC_LINK` or a macOS identity in the config and remove `CSC_IDENTITY_AUTO_DISCOVERY=false` from the workflow.

## Steam Deck

The AppImage is the Steam Deck build. Desktop Mode: download, `chmod +x`, run. Game Mode: add it as a non-Steam game; the app starts fullscreen there (it detects the `SteamDeck` environment variable) and the Deck's controls appear as a standard gamepad, which the game already supports. Full steps and launch-option examples are in `ELECTRON.md`.

## Changing what gets built

- Targets and architectures: `win.target`, `linux.target`, `mac.target` in `electron/builder.config.cjs` (for example add `arm64` to Linux, or `deb`).
- Name, description, icon come from `public/manifest.webmanifest` and `public/favicon.svg` (`npm run electron:icons`), not from the config.
- Never include `node_modules` in `files`: the renderer is fully bundled by Vite and the packaged app needs no runtime dependencies.
