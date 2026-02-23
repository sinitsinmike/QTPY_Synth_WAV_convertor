# QTPY Synth — Design Spec (Save/Load, Setup Menu, Pad Tuning, Latch)

**Status:** design doc for incremental implementation (do not implement all at once).  
**Target platform:** Adafruit QT Py RP2040, CircuitPython (QT Py Synth project).  
**Controls:** 1 momentary button (KEY), 2 potentiometers (A/B), 4 touch pads, small display.

---

## Goals

1. Add **Save/Load** without requiring a computer.
2. Add a **second menu/screen** (“Setup”) for advanced functions.
3. Add **Pad Tuning** (coarse + fine) that affects **touch pads only** (not MIDI).
4. Add **Latch** per pad (touch pads can toggle Note On/Off).
5. Keep the main play workflow fast and musical; avoid accidental saves/loads.

---

## Important UX Constraint: Potentiometers (not encoders)

- Pots provide **absolute** position values (0..65535).
- When one pot controls multiple parameters across modes, the “current parameter value” can differ from the pot’s physical position.
- Existing code uses a **pickup/catch-up** mechanism per mode (virtual saved knob positions) that can require rotating to match a stored position before the parameter updates.

### Policy for new features
- **Main play modes:** keep existing pickup behavior (safe for audio; avoids jumps).
- **Setup / Menu interactions:** prefer **SNAP** behavior (read raw pot values) + “arming/edge-trigger” for OK/Cancel to avoid the feeling of “nothing happens”.

---

## Current Behavior in Original Code (baseline)

### 4 knob modes (already present)
- **Mode 0:** Knob A = select sound source (`osc:X/Y` or `wtb:NAME`), Knob B = `wave_mix`
- **Mode 1:** Knob A = `detune`, Knob B = `wave_mix_lfo_amount` (mainly affects WTB)
- **Mode 2:** Knob A = `filt_type` (0..3), Knob B = `filt_f` (~100..8000 Hz)
- **Mode 3:** Knob A = `filt_q` (~0.5..2.5), Knob B = `filt_env_attack` (~1..0.01)

### Original Load idea (already in code, currently disabled)
- **Hold KEY + tap touch pad 1–4** was intended to load patch 1–4.
- The actual load call is commented out (“disable this for now”).
- No Save exists in original.

---

## Feature Set (target behavior)

### A) Quick Save/Load (no menu)
**Purpose:** fastest way to store/recall 4 slots during play, with **no false triggers**.

#### Hold windows (non-overlapping)
- **2s ≤ hold < 5s → ARM LOAD**
- **5s ≤ hold < 8s → ARM SAVE**
- **hold ≥ 8s → enter Setup Menu (Screen #2)** *(only if no slot was selected)*

#### Slot selection rule (critical)
Once a slot is selected (touch pad 1–4) while armed:
- perform **Load(slot)** or **Save(slot)**
- set `slot_selected = True`
- **ignore all further hold thresholds** (Save window / Screen2) until KEY is released
- immediately clear arm indicators (UI)

#### Interaction
- While **ARM LOAD**: touch pad **1–4** loads slot **1–4**
- While **ARM SAVE**: touch pad **1–4** saves slot **1–4**
- Release KEY with no slot selected: cancel (no action)

**Notes**
- This replaces the original “key_held boolean” concept with timed windows.
- Must provide clear feedback (display text or LED blink pattern).
---

### B) Setup Menu (Screen #2)
**Entry:** Hold KEY **8 seconds** from main screen → enter Setup Menu.  
**Exit:** Hold KEY 2 seconds in Setup → exit (or dedicated “Exit” menu item).

**Navigation (simple, reliable)**
- KEY short press: next menu item (cycles).
- Pots use **SNAP** behavior in setup.
- Touch pads behavior depends on the menu item:
  - In **Tune** and **Latch** menu items: touch pads keep acting like musical keys (real-time sound).
  - In **Load** and **Save** menu items: touch pads are *not used* for OK/Cancel (we use pots).

#### Menu items (v1)
1. **Tune**
2. **Latch**
3. **Load**
4. **Save**
(Optionally 5. Exit)

---

### C) Tune (per patch, touch-only tuning)
**Goal:** Adjust each pad’s pitch without PC.  
**Storage:** *per patch*.

**Behavior**
- Touch pads still play sound like usual.
- **While holding a pad**, pots adjust its tuning:
  - **Knob A (left) = Coarse**: integer semitone offset **±12** (25 steps).
  - **Knob B (right) = Fine**: cents offset, recommended **±100 cents** (or ±50; choose later).
- The sound for the held pad updates in real-time (pitch changes immediately).
- When no pad is held, knobs do nothing (or show current pad values; optional).

**What’s stored in patch**
- `pad_note_int[4]`: base MIDI note numbers for pads (int).
- `pad_fine_cents[4]`: fine offsets (int cents, e.g. -100..+100).

**Important: MIDI must not be “detuned”**
- If note is triggered from MIDI input: **ignore pad tuning**.
- If note is triggered from touch pad: apply pad tuning.

**Pitch math**
- `pitch = pad_note_int[i] + pad_fine_cents[i] / 100`
- `freq = 440 * 2^((pitch - 69) / 12)`

---

### D) Latch (per pad)
**Goal:** Each pad can be configured to toggle.  
**Storage:** *per patch*.

**Runtime behavior**
- If `latch_enabled[i] == False`:
  - pad press → Note On
  - pad release → Note Off
- If `latch_enabled[i] == True`:
  - pad press toggles:
    - if note currently active → Note Off
    - else → Note On
  - pad release does nothing.

**How to configure latch while still playing sound**
In the **Latch** menu item:
- Pads must remain musical keys.
- Therefore latch configuration needs a modifier gesture, e.g.:
  - **Hold KEY 1 second + tap pad i** → toggle `latch_enabled[i]`.
- Display shows latch state for each pad (e.g. `L: 1✓ 2· 3✓ 4·`).

---

### E) Load/Save inside Setup Menu (unlimited slots)
**Goal:** Not limited to 4, uses pots only (pads remain free).

**Load menu item**
- **Knob A (left)**: scroll through slots **1..N** (SNAP).
- **Knob B (right)**: confirmation by extremes (arming + edge-trigger)
  - Turn fully left → Cancel
  - Turn fully right → OK (Load)

**Save menu item**
- Same controls as Load, but OK writes patch to slot.

#### Arming (anti-accidental)
When entering Load/Save menu item:
- `armed=False`
- Wait until Knob B enters neutral zone (e.g. 40–60%).
- Once neutral observed → `armed=True`
- Only then allow OK/Cancel on extremes.

#### Edge-trigger (avoid repeat firing)
- OK triggers only when crossing into the extreme region from non-extreme.
- Cancel triggers only when crossing into the other extreme from non-extreme.

---

## Patch Data Model (minimal)

### Patch content (to persist)
- `wave_select` (e.g. `osc:SAW/SIN` or `wtb:A1`)
- `wave_mix`
- `detune`
- `wave_mix_lfo_amount`
- `filt_type`
- `filt_f`
- `filt_q`
- `filt_env_attack` (and any other env params used)
- `pad_note_int[4]`
- `pad_fine_cents[4]`
- `latch_enabled[4]`

### Exclusions
- Do **not** store “knob saved positions” per mode.
- Do **not** store transient runtime state.

### Storage format
- JSON on CIRCUITPY filesystem, e.g.:
  - `/patches/slot_001.json`
  - `/patches/slot_002.json`
  - …
- Quick slots map to 1–4.
- Setup menu can support N slots (e.g. 32).

---

## Display / Feedback Requirements

### Quick Save/Load
- Show “ARM LOAD” or “ARM SAVE”
- When slot selected: show “LOAD 2 OK” / “SAVE 3 OK”
- On error: show “ERR” and keep running.

### Setup Menu
- Show current menu item name (Tune/Latch/Load/Save).
- Tune:
  - show pad notes + fine cents (simple compact layout)
- Latch:
  - show latch status per pad
- Load/Save:
  - show selected slot number and file existence indicator (optional)

---

## Implementation Plan (Incremental Tasks)

### Step 1 — Quick Save/Load by hold duration
- Add KEY press timing (monotonic).
- Implement ARM LOAD (2s) + ARM SAVE (5s).
- Touch pads 1–4 select slot.
- Implement file I/O JSON for slots 1–4.
- Add display feedback.

### Step 2 — Setup Menu scaffolding (placeholders)
- Add “Screen #2” state machine.
- Enter with hold 10s, exit with hold 2s (or explicit Exit).
- Implement menu navigation and knob SNAP reading.
- Show placeholder screens, no tuning/latch yet.

### Step 3 — Tune (per patch, touch-only)
- Add `pad_note_int` and `pad_fine_cents` to patch model.
- Implement “hold pad + pots coarse/fine” behavior in Tune menu item.
- Apply tuning only to touch pad notes; MIDI notes remain unmodified.
- Display current tuning values.

### Step 4 — Latch per pad (per patch)
- Add `latch_enabled[4]` to patch model.
- Implement runtime latch behavior for pads.
- Implement latch configuration gesture in Latch menu item (KEY-hold + tap pad).
- Display latch states.

### Step 5 — Setup Menu Load (unlimited slots)
- Implement slot selection via Knob A.
- Implement OK/Cancel via Knob B with arming + edge-trigger.
- Load patch from JSON; apply to instrument.
- Display slot & status.

### Step 6 — Setup Menu Save (unlimited slots)
- Same as Load, but writes patch JSON.
- Include overwrite handling (OK required).
- Display result.

---

## Open Decisions (to finalize before coding)

1. Tune fine range: **±50** or **±100** cents.
2. Slot count N in setup menu: 16/32/64 (tradeoff: scrolling speed vs storage).
3. Latch config gesture exact timing: KEY hold 0.8s/1.0s; and whether tap must be short.
4. Whether Load/Save menu item keeps audio output on during selection (recommended: keep audio on).
