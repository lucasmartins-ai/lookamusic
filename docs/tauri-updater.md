# Tauri desktop — auto-update

The desktop app self-updates from GitHub Releases via the Tauri v2
updater plugin (signed artifacts + `latest.json` manifest).

## How it works

- `src-tauri/tauri.conf.json` → `bundle.createUpdaterArtifacts: true` and
  `plugins.updater` with `endpoints:
  https://github.com/lucasmartins-ai/lookamusic/releases/latest/download/latest.json`
  plus the public key.
- Rust (`src-tauri/src/lib.rs`) registers `tauri_plugin_updater` and
  `tauri-plugin-process` (relaunch); capabilities grant
  `updater:default` + `process:default`.
- Frontend (`features/desktop/updater.ts` + `TauriUpdateButton`, mounted on
  `/` and `/session`) checks on demand, downloads, installs and relaunches.
  Outside Tauri (browser/PWA/tests) it no-ops.
- `.github/workflows/tauri-release.yml`: push a `v*` tag → builds all
  platforms, signs artifacts and creates a **draft** release containing
  `latest.json`. Review + publish the draft; apps pick it up.

## Local build (this machine)

```sh
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/lookamusic.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run tauri:build
# → src-tauri/target/release/bundle/dmg/LookaMusic_*_aarch64.dmg
# → src-tauri/target/release/bundle/macos/LookaMusic.app.tar.gz (+ .sig)
```

Gotchas:

- The bundle signer reads the key **content** (`TAURI_SIGNING_PRIVATE_KEY`),
  not `_PATH`, in CLI 2.11 — pass the content.
- The frontend is a static export (`out/`) only for Tauri
  (`npm run build:tauri` sets `TAURI_BUILD=1`); plain `npm run build`
  keeps the web server build.
- The editor route is `/compose/editor?id=` (static-friendly);
  `/compose/[id]` still works on web.
- Unsigned macOS builds: first launch via right-click → Open
  (Gatekeeper). Updater replaces the .app in place afterwards.

## Keys

- Private: `~/.tauri/lookamusic.key` (mode 600, **never commit**).
- Public: embedded in `tauri.conf.json` (`plugins.updater.pubkey`).
- CI secret needed: `TAURI_SIGNING_PRIVATE_KEY` = key content.
- Lose the private key → old installs can never verify a new key;
  generate once, back it up.
