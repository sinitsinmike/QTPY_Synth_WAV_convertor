# QT Py Synth WAV Converter (Offline bundle)

## What's inside
- `index.html` + `app.js` (no CDN imports)
- `deps/` folder where you place ffmpeg.wasm assets and small JS deps

## Required deps (download once)
Put these exact filenames into `deps/`:

- `ffmpeg-core.js`
- `ffmpeg-core.wasm`
- `worker.js`
- `ffmpeg.esm.js`
- `ffmpeg-util.esm.js`
- `jszip.esm.js`

## Direct download links
FFmpeg core (single-thread):
- https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js
- https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm

Worker:
- https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js

ESM wrappers:
- https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js  (save as `deps/ffmpeg.esm.js`)
- https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js     (save as `deps/ffmpeg-util.esm.js`)
- https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm                          (save as `deps/jszip.esm.js`)

## Running locally
Most browsers block `Worker` under `file://`. Use one of these:
- VS Code + extension "Live Server" (right click index.html -> Open with Live Server)
- Any small static server that serves this folder as http://localhost/...

If you later want *true double-click* for end users, build it as a Tauri app (recommended).
