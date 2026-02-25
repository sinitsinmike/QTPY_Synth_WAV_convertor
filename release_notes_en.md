# QTPY_Synth_V3 — Release Notes (EN)

Date: 2026-02-26  
Device: Adafruit QT Py RP2040 (CircuitPython 9.x)

## What’s new / Focus of this release
QTPY_Synth_V3 is a “code freeze” release focused on stable live performance and quick control:
- **Latch** (per-pad note latch) on Screen 2.
- **Tune** (per-pad pitch tuning: coarse + fine) on Screen 2.
- **Quick Load / Quick Save** (slot 1–4) from **Screen 1**, via a button-hold + pad select.
- **Boot file-transfer mode**: hold the button while powering on → CIRCUITPY drive is visible to copy WAVs into `/wav` and update files.

> Note: **Load/Save items on Screen 2 are temporarily hidden** to avoid behavior changes and regressions. Quick Save/Load remains available on **Screen 1**.

---

## UI: Screens
### Screen 1 (Main)
- Displays 4 lines, each with a pair of parameters.
- The underlined line is the currently editable parameter pair.
- **Short button tap** cycles which line the knobs edit (0→1→2→3→0).
- Touch pads (1–4): play/release notes (unless Latch is enabled).

### Screen 2 (Setup)
Enter / exit:
- **Hold the button ~8 seconds** → enter Setup (Screen 2).
- Screen 2 has modes:
  - **LATCH**
  - **TUNE**
- **Short tap** on Screen 2: cycle mode (LATCH ↔ TUNE).
- **Hold the button ~2 seconds** on Screen 2: exit back to Screen 1.

---

## Latch (Screen 2 → LATCH)
Goal: latch a pad so the note keeps playing without holding the pad.

How to use:
1. Enter Screen 2 (hold button ~8s).
2. Select **LATCH** (tap if needed).
3. Press pads 1–4:
   - Toggles Latch **ON/OFF** per pad.
   - When ON: the note starts and keeps sounding.
   - When OFF: the note stops.

---

## Tune (Screen 2 → TUNE)
Goal: tune each pad independently.

How to use:
1. Enter Screen 2.
2. Switch to **TUNE** (tap the button).
3. Press pad 1–4 to select which pad you’re tuning.
4. Knobs:
   - **Left knob**: coarse tuning (roughly ±12 semitones).
   - **Right knob**: fine tuning (roughly -100…+100 cents).
5. During tuning the device may play a preview note (Latch OFF) or update the latched note (Latch ON).

---

## Quick Load / Quick Save (Screen 1)
Quick Load/Save are available **only from Screen 1** (no Setup menu needed).

### Quick Load (button hold 2–5 seconds)
1. On Screen 1, hold the button for **2–5s**.
2. Status shows **ARM LOAD 1-4**.
3. Press pad 1–4 → loads slot (1..4).

### Quick Save (button hold 5–8 seconds)
1. On Screen 1, hold the button for **5–8s**.
2. Status shows **ARM SAVE 1-4**.
3. Press pad 1–4 → saves slot (1..4).

Cancel:
- Release the button without choosing a slot → operation cancels (may show “Cancel”).

> Saving happens **only when you explicitly Save**. No auto-save (by design).

---

## Boot file-transfer mode: visible CIRCUITPY drive (for WAV upload)
Goal: a simple way to copy wavetables to `/wav`.

How to enter:
1. **Hold the device’s single button.**
2. **Power on** (or reboot).
3. The **CIRCUITPY** drive becomes visible on the computer — copy files (e.g. `*.WAV`) into `/wav`.

How to exit:
- Power cycle **without holding the button** → returns to normal mode where the drive is hidden and patch saving works.

---

## Updating from the Git ZIP
- The project is shipped as **QTPY_Synth_V3.zip** on Git.
- Unzip and **copy contents to CIRCUITPY (overwrite existing files)**.
- You may **leave `/wav` untouched** to keep your own wavetables.

---

## Known limitations
- Screen 2 menu items for Load/Save are temporarily hidden (code freeze).
- Saving/loading is available through Quick Save/Load on Screen 1.
