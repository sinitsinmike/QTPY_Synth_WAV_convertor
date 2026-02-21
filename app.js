/**
 * QT Py Synth WAV Converter (Offline bundle)
 *
 * Requires deps/ffmpeg-core.js + deps/ffmpeg-core.wasm + deps/worker.js
 * Optionally deps/jszip.esm.js
 */
import JSZip from "./deps/jszip.esm.js";
import { FFmpeg } from "./deps/ffmpeg.esm.js";
import { fetchFile, toBlobURL } from "./deps/ffmpeg-util.esm.js";

const UI = {
  drop: document.getElementById("drop"),
  fileInput: document.getElementById("fileInput"),
  wavesSelect: document.getElementById("wavesSelect"),
  fadeIn: document.getElementById("fadeIn"),
  fadeOut: document.getElementById("fadeOut"),
  fadeLen: document.getElementById("fadeLen"),
  convertBtn: document.getElementById("convertBtn"),
  zipBtn: document.getElementById("zipBtn"),
  log: document.getElementById("log"),
  results: document.getElementById("results"),
};

/** @type {File[]} */
let selectedFiles = [];
/** @type {{name:string, blob:Blob}[]} */
let converted = [];

const ffmpeg = new FFmpeg();
let ffmpegLoaded = false;

function log(line) {
  UI.log.textContent += `${line}\n`;
  UI.log.scrollTop = UI.log.scrollHeight;
}

function setFiles(files) {
  selectedFiles = Array.from(files || []).filter(
    (f) => f && (f.type === "audio/wav" || f.name.toLowerCase().endsWith(".wav"))
  );
  UI.convertBtn.disabled = selectedFiles.length === 0;
  UI.zipBtn.disabled = true;
  converted = [];
  UI.results.innerHTML = "";
  UI.log.textContent = "";
  if (selectedFiles.length) log(`Selected ${selectedFiles.length} file(s).`);
  else log("No WAV files selected.");
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

async function ensureFFmpeg() {
  if (ffmpegLoaded) return;

  log("Loading ffmpeg.wasm ...");

  // Use local deps (no CDN)
  // Use blob URLs to keep Worker same-origin safe.
  const coreURL = await toBlobURL("./deps/ffmpeg-core.js", "text/javascript");
  const wasmURL = await toBlobURL("./deps/ffmpeg-core.wasm", "application/wasm");
  const classWorkerURL = await toBlobURL("./deps/worker.js", "text/javascript");

  await ffmpeg.load({ coreURL, wasmURL, classWorkerURL });

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

  function str4(off) {
    return String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);
  }
  function u32(off) {
    return dv.getUint32(off, true);
  }
  function u16(off) {
    return dv.getUint16(off, true);
  }

  if (str4(0) !== "RIFF" || str4(8) !== "WAVE") throw new Error("Not a RIFF/WAVE file");

  let offset = 12;
  let fmt = null;
  let dataOff = -1;
  let dataSize = 0;

  while (offset + 8 <= u8.length) {
    const id = str4(offset);
    const size = u32(offset + 4);
    const body = offset + 8;

    if (id === "fmt ") {
      const audioFormat = u16(body + 0);
      const numChannels = u16(body + 2);
      const sampleRate = u32(body + 4);
      const bitsPerSample = u16(body + 14);
      fmt = { audioFormat, numChannels, sampleRate, bitsPerSample };
    } else if (id === "data") {
      dataOff = body;
      dataSize = size;
      break;
    }

    offset = body + size + (size % 2);
  }

  if (!fmt) throw new Error("WAV missing fmt chunk");
  if (dataOff < 0) throw new Error("WAV missing data chunk");

  if (fmt.audioFormat !== 1) throw new Error("WAV is not PCM (format != 1)");
  if (fmt.numChannels !== 1) throw new Error("WAV is not mono");
  if (fmt.bitsPerSample !== 16) throw new Error("WAV is not 16-bit");

  const dataEnd = Math.min(dataOff + dataSize, u8.length);
  const pcmBytes = u8.slice(dataOff, dataEnd);
  const pcmBuf = pcmBytes.buffer.slice(pcmBytes.byteOffset, pcmBytes.byteOffset + pcmBytes.byteLength);

  return { sampleRate: fmt.sampleRate, samples: new Int16Array(pcmBuf) };
}

function writeWavPcm16Mono(samples, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const riffSize = 36 + dataSize;

  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  function putStr(off, s) {
    for (let i = 0; i < s.length; i++) u8[off + i] = s.charCodeAt(i);
  }
  function putU32(off, v) {
    dv.setUint32(off, v, true);
  }
  function putU16(off, v) {
    dv.setUint16(off, v, true);
  }

  putStr(0, "RIFF");
  putU32(4, riffSize);
  putStr(8, "WAVE");

  putStr(12, "fmt ");
  putU32(16, 16);
  putU16(20, 1);
  putU16(22, numChannels);
  putU32(24, sampleRate);
  putU32(28, byteRate);
  putU16(32, blockAlign);
  putU16(34, bitsPerSample);

  putStr(36, "data");
  putU32(40, dataSize);

  new Int16Array(buf, 44, samples.length).set(samples);
  return new Blob([buf], { type: "audio/wav" });
}

function trimOrPad(samples, targetLen) {
  if (samples.length === targetLen) return samples;
  const out = new Int16Array(targetLen);
  if (samples.length > targetLen) out.set(samples.subarray(0, targetLen));
  else out.set(samples);
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

  if (fadeIn) {
    for (let i = 0; i < n; i++) {
      const g = i / n;
      out[i] = (out[i] * g) | 0;
    }
  }
  if (fadeOut) {
    for (let i = 0; i < n; i++) {
      const idx = out.length - n + i;
      const g = 1 - i / n;
      out[idx] = (out[idx] * g) | 0;
    }
  }
  return out;
}

async function convertOne(file, targetWaves, doFadeIn, doFadeOut, fadeLen) {
  const base = sanitizeBaseName(file.name);
  const inName = `${base}_in.wav`;
  const midName = `${base}_mid.wav`;
  const outName = `${base}_qtpy_${targetWaves}x256.wav`;

  await ffmpeg.writeFile(inName, await fetchFile(file));

  await ffmpeg.exec([
    "-hide_banner",
    "-y",
    "-i",
    inName,
    "-ac",
    "1",
    "-ar",
    "44100",
    "-c:a",
    "pcm_s16le",
    "-map_metadata",
    "-1",
    midName,
  ]);

  const mid = await ffmpeg.readFile(midName);
  const midBuf = mid.buffer.slice(mid.byteOffset, mid.byteOffset + mid.byteLength);

  const { sampleRate, samples } = parseWavPcm16Mono(midBuf);
  if (sampleRate !== 44100) throw new Error(`Unexpected sample rate after ffmpeg: ${sampleRate}`);

  const targetSamples = targetWaves * 256;
  let fixed = trimOrPad(samples, targetSamples);
  fixed = applyFade(fixed, doFadeIn, doFadeOut, fadeLen);

  const blob = writeWavPcm16Mono(fixed, 44100);

  try {
    await ffmpeg.deleteFile(inName);
  } catch {}
  try {
    await ffmpeg.deleteFile(midName);
  } catch {}

  return { outName, blob, info: { inSamples: samples.length, outSamples: targetSamples } };
}

function addResult(name, blob, info) {
  const url = URL.createObjectURL(blob);
  const li = document.createElement("li");

  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.textContent = name;

  const meta = document.createElement("div");
  meta.className = "muted";
  meta.textContent = `samples: ${info.inSamples} → ${info.outSamples}`;

  li.appendChild(a);
  li.appendChild(meta);
  UI.results.appendChild(li);

  converted.push({ name, blob });
}

async function downloadZip() {
  const zip = new JSZip();
  for (const item of converted) zip.file(item.name, item.blob);
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "qtpy_synth_wavetables.zip";
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function onConvert() {
  UI.convertBtn.disabled = true;
  UI.zipBtn.disabled = true;
  UI.results.innerHTML = "";
  UI.log.textContent = "";
  converted = [];

  const targetWaves = getTargetWaves();
  const doFadeIn = UI.fadeIn.checked;
  const doFadeOut = UI.fadeOut.checked;
  const fadeLen = getFadeLen();

  if (!selectedFiles.length) {
    log("No files.");
    UI.convertBtn.disabled = false;
    return;
  }

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

// Drag & drop
UI.drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  UI.drop.classList.add("dragover");
});
UI.drop.addEventListener("dragleave", () => UI.drop.classList.remove("dragover"));
UI.drop.addEventListener("drop", (e) => {
  e.preventDefault();
  UI.drop.classList.remove("dragover");
  setFiles(e.dataTransfer.files);
  UI.fileInput.value = "";
});

UI.fileInput.addEventListener("change", (e) => setFiles(e.target.files));
UI.convertBtn.addEventListener("click", onConvert);
UI.zipBtn.addEventListener("click", downloadZip);

// Init
setFiles([]);
