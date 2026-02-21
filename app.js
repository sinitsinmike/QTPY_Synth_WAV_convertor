/* file: app.js (build: pages-v5)
 * Uses CDN ESM for @ffmpeg/ffmpeg + @ffmpeg/util (so no missing module graph).
 * Uses local /deps for core + workers to avoid silent worker failures.
 */

const BUILD = "pages-v5";

const UI = {
  drop: document.getElementById("drop"),
  fileInput: document.getElementById("fileInput"),
  wavesSelect: document.getElementById("wavesSelect"),
  fadeIn: document.getElementById("fadeIn"),
  fadeOut: document.getElementById("fadeOut"),
  fadeLen: document.getElementById("fadeLen"),
  convertBtn: document.getElementById("convertBtn"),
  zipBtn: document.getElementById("zipBtn"),
  selfCheckBtn: document.getElementById("selfCheckBtn"),
  log: document.getElementById("log"),
  results: document.getElementById("results"),
};

let selectedFiles = [];
let converted = [];

let deps = null; // { FFmpeg, fetchFile, toBlobURL, JSZip }
let ffmpeg = null;
let ffmpegLoaded = false;

function log(line) {
  UI.log.textContent += `${line}\n`;
  UI.log.scrollTop = UI.log.scrollHeight;
}
function clearLog() { UI.log.textContent = ""; }

window.addEventListener("error", (e) => log(`JS ERROR: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => log(`PROMISE ERROR: ${e.reason?.message || String(e.reason)}`));
log(`app.js loaded (${BUILD})`);

function setFiles(files) {
  selectedFiles = Array.from(files || []).filter((f) => f && f.name);
  UI.convertBtn.disabled = selectedFiles.length === 0;
  UI.zipBtn.disabled = true;
  converted = [];
  UI.results.innerHTML = "";
  clearLog();
  log(`app.js loaded (${BUILD})`);
  log(selectedFiles.length ? `Selected ${selectedFiles.length} file(s).` : "No files selected.");
}

function getTargetWaves() {
  const v = UI.wavesSelect.value;
  if (v === "auto") return 64;
  const n = Number(v);
  return Number.isFinite(n) ? n : 64;
}
function getFadeLen() {
  const v = Number(UI.fadeLen.value);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

async function selfCheckDeps() {
  clearLog();
  log(`Self-check started... (${BUILD})`);
  const urls = [
    "./app.js",
    "./deps/ffmpeg-core.js",
    "./deps/ffmpeg-core.wasm",
    "./deps/ffmpeg-core.worker.js",
    "./deps/worker.js",
    "./deps/const.js",
    "./deps/errors.js",
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      const size = r.headers.get("content-length");
      log(`${r.ok ? "✅" : "❌"} ${url} -> ${r.status}${size ? ` (${size} bytes)` : ""}`);
    } catch (e) {
      log(`❌ ${url} -> ${e?.message || String(e)}`);
    }
  }
  log("Self-check done.");
}

async function loadDeps() {
  if (deps) return deps;

  log("Loading JS deps from CDN...");
  const [{ FFmpeg }, util, { default: JSZip }] = await Promise.all([
    import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js"),
    import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js"),
    import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm"),
  ]);

  deps = { FFmpeg, fetchFile: util.fetchFile, toBlobURL: util.toBlobURL, JSZip };
  log("Deps loaded.");
  return deps;
}

async function ensureFFmpeg() {
  if (ffmpegLoaded) return;

  const { FFmpeg, toBlobURL } = await loadDeps();
  ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => log(message)); // useful for “stuck” cases

  log("Loading ffmpeg.wasm ...");

  // local assets (same origin)
  const coreURL = await toBlobURL("./deps/ffmpeg-core.js", "text/javascript");
  const wasmURL = await toBlobURL("./deps/ffmpeg-core.wasm", "application/wasm");
  const workerURL = await toBlobURL("./deps/ffmpeg-core.worker.js", "text/javascript");

  // IMPORTANT: class worker must be a normal URL so it can import ./const.js and ./errors.js
  const classWorkerURL = "./deps/worker.js";

  // Add timeout so it never “hangs silently”
  const loadPromise = ffmpeg.load({ coreURL, wasmURL, workerURL, classWorkerURL });
  const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error("ffmpeg.load() timeout (15s)")), 15000));
  await Promise.race([loadPromise, timeoutPromise]);

  ffmpegLoaded = true;
  log("ffmpeg.wasm loaded.");
}

function sanitizeBaseName(filename) {
  const base = filename.replace(/\.[^.]+$/, "");
  return base.replace(/[^\w.-]+/g, "_").slice(0, 80) || "converted";
}

function parseWavPcm16Mono(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  const str4 = (off) => String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);
  const u32 = (off) => dv.getUint32(off, true);
  const u16 = (off) => dv.getUint16(off, true);

  if (str4(0) !== "RIFF" || str4(8) !== "WAVE") throw new Error("Not a RIFF/WAVE file");

  let offset = 12, fmt = null, dataOff = -1, dataSize = 0;
  while (offset + 8 <= u8.length) {
    const id = str4(offset);
    const size = u32(offset + 4);
    const body = offset + 8;

    if (id === "fmt ") {
      fmt = { audioFormat: u16(body + 0), numChannels: u16(body + 2), sampleRate: u32(body + 4), bitsPerSample: u16(body + 14) };
    } else if (id === "data") {
      dataOff = body; dataSize = size; break;
    }
    offset = body + size + (size % 2);
  }

  if (!fmt) throw new Error("WAV missing fmt chunk");
  if (dataOff < 0) throw new Error("WAV missing data chunk");
  if (fmt.audioFormat !== 1) throw new Error("WAV is not PCM");
  if (fmt.numChannels !== 1) throw new Error("WAV is not mono");
  if (fmt.bitsPerSample !== 16) throw new Error("WAV is not 16-bit");

  const dataEnd = Math.min(dataOff + dataSize, u8.length);
  const pcmBytes = u8.slice(dataOff, dataEnd);
  const pcmBuf = pcmBytes.buffer.slice(pcmBytes.byteOffset, pcmBytes.byteOffset + pcmBytes.byteLength);
  return { sampleRate: fmt.sampleRate, samples: new Int16Array(pcmBuf) };
}

function writeWavPcm16Mono(samples, sampleRate = 44100) {
  const numChannels = 1, bitsPerSample = 16;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const riffSize = 36 + dataSize;

  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  const putStr = (off, s) => { for (let i = 0; i < s.length; i++) u8[off + i] = s.charCodeAt(i); };
  putStr(0, "RIFF"); dv.setUint32(4, riffSize, true); putStr(8, "WAVE");
  putStr(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, numChannels, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, byteRate, true); dv.setUint16(32, blockAlign, true); dv.setUint16(34, bitsPerSample, true);
  putStr(36, "data"); dv.setUint32(40, dataSize, true);

  new Int16Array(buf, 44, samples.length).set(samples);
  return new Blob([buf], { type: "audio/wav" });
}

function trimOrPad(samples, targetLen) {
  const out = new Int16Array(targetLen);
  out.set(samples.subarray(0, Math.min(samples.length, targetLen)));
  return out;
}

function applyFade(samples, fadeIn, fadeOut, fadeLen) {
  const out = new Int16Array(samples.length);
  out.set(samples);
  let n = fadeLen | 0;
  if (n <= 0) return out;
  const maxFade = Math.floor(out.length / 2);
  if (n > maxFade) n = maxFade;
  if (n <= 0) return out;

  if (fadeIn) for (let i = 0; i < n; i++) out[i] = (out[i] * (i / n)) | 0;
  if (fadeOut) for (let i = 0; i < n; i++) {
    const idx = out.length - n + i;
    out[idx] = (out[idx] * (1 - i / n)) | 0;
  }
  return out;
}

async function convertOne(file, targetWaves, doFadeIn, doFadeOut, fadeLen) {
  const { fetchFile } = await loadDeps();
  const base = sanitizeBaseName(file.name);

  const inName = `${base}_in.wav`;
  const midName = `${base}_mid.wav`;
  const outName = `${base}_qtpy_${targetWaves}x256.wav`;

  await ffmpeg.writeFile(inName, await fetchFile(file));
  await ffmpeg.exec(["-hide_banner","-y","-i",inName,"-ac","1","-ar","44100","-c:a","pcm_s16le","-map_metadata","-1",midName]);

  const mid = await ffmpeg.readFile(midName);
  const midBuf = mid.buffer.slice(mid.byteOffset, mid.byteOffset + mid.byteLength);

  const { sampleRate, samples } = parseWavPcm16Mono(midBuf);
  if (sampleRate !== 44100) throw new Error(`Unexpected sample rate after ffmpeg: ${sampleRate}`);

  const targetSamples = targetWaves * 256;
  let fixed = trimOrPad(samples, targetSamples);
  fixed = applyFade(fixed, doFadeIn, doFadeOut, fadeLen);

  const blob = writeWavPcm16Mono(fixed, 44100);

  try { await ffmpeg.deleteFile(inName); } catch {}
  try { await ffmpeg.deleteFile(midName); } catch {}

  return { outName, blob, info: { inSamples: samples.length, outSamples: targetSamples } };
}

function addResult(name, blob, info) {
  const url = URL.createObjectURL(blob);
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = url; a.download = name; a.textContent = name;

  const meta = document.createElement("div");
  meta.className = "muted";
  meta.textContent = `samples: ${info.inSamples} → ${info.outSamples}`;

  li.appendChild(a); li.appendChild(meta);
  UI.results.appendChild(li);

  converted.push({ name, blob });
}

async function downloadZip() {
  const { JSZip } = await loadDeps();
  const zip = new JSZip();
  for (const item of converted) zip.file(item.name, item.blob);
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url; a.download = "qtpy_synth_wavetables.zip"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function onConvert() {
  UI.convertBtn.disabled = true;
  UI.zipBtn.disabled = true;
  UI.results.innerHTML = "";
  clearLog();
  converted = [];

  const targetWaves = getTargetWaves();
  const doFadeIn = UI.fadeIn.checked;
  const doFadeOut = UI.fadeOut.checked;
  const fadeLen = getFadeLen();

  log(`Target: ${targetWaves} waves × 256 = ${targetWaves * 256} samples`);
  log(`Fade-in: ${doFadeIn ? "ON" : "OFF"}, Fade-out: ${doFadeOut ? "ON" : "OFF"}, FadeLen: ${fadeLen}`);

  try {
    await ensureFFmpeg();
    for (let i = 0; i < selectedFiles.length; i++) {
      const f = selectedFiles[i];
      log(`\n[${i + 1}/${selectedFiles.length}] Converting: ${f.name}`);
      const res = await convertOne(f, targetWaves, doFadeIn, doFadeOut, fadeLen);
      addResult(res.outName, res.blob, res.info);
      log(`OK: ${res.outName}`);
    }
    UI.zipBtn.disabled = converted.length <= 1;
    log(`\nDone. Converted: ${converted.length}`);
  } catch (e) {
    log(`\nERROR: ${e?.message || String(e)}`);
  } finally {
    UI.convertBtn.disabled = selectedFiles.length === 0;
  }
}

// Bind UI
UI.drop.addEventListener("dragover", (e) => { e.preventDefault(); UI.drop.classList.add("dragover"); });
UI.drop.addEventListener("dragleave", () => UI.drop.classList.remove("dragover"));
UI.drop.addEventListener("drop", (e) => { e.preventDefault(); UI.drop.classList.remove("dragover"); setFiles(e.dataTransfer.files); UI.fileInput.value = ""; });
UI.fileInput.addEventListener("change", (e) => setFiles(e.target.files));
UI.convertBtn.addEventListener("click", onConvert);
UI.zipBtn.addEventListener("click", () => downloadZip().catch((e) => log(`ZIP ERROR: ${e?.message || e}`)));
UI.selfCheckBtn.addEventListener("click", () => selfCheckDeps().catch((e) => log(`CHECK ERROR: ${e?.message || e}`)));

setFiles([]);
