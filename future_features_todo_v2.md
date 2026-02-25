# Future features TODO

## 1) Persist pad tuning inside patches
- Save/restore per-pad tuning (coarse MIDI note + fine cents) as part of a patch.
- When loading a patch, update the tuned pad note values and refresh Screen2 TUNE UI.
- Consider backward compatibility for older patch JSON files (missing tune fields).

## 2) Optional arpeggiator in Setup screen
- Add Arp On/Off and Arp Shape (Up, Down, Up+Down, Down+Up).
- Root note = last pressed pad.
- Arp should play only the 4 pad-assigned notes.
- Interaction with Latch:
  - If Latch is OFF, Arp can be enabled normally.
  - If Latch is ON, either disable Arp or force Latch OFF when enabling Arp (choose behavior).
- Use the empty space at the bottom of Screen2 for controls/status.
## 3) Global transpose (Screen1, no menu)
Goal: A single global transpose value applied to **all** notes (pads + MIDI). Show it on Screen1 in the bottom-right corner as `Tr:=<N>`.

### UI / gesture
- No menu item.
- While holding the key **before** Quick Load arms (i.e., during the initial hold period):
  - Any movement on either pot switches the hold action into **Transpose edit** mode.
  - Once transpose edit starts, it **cancels** the pending timers for:
    - ARM LOAD (2–5s)
    - ARM SAVE (5–8s)
    - Enter Setup/Screen2 (>=8s)
- Controls while key is held:
  - Left pot = **coarse transpose** (integer semitones, e.g. -24..+24).
  - Right pot = **fine transpose** (optional: cents or 0.1-semitone steps). If you want strictly semitones only, reuse right pot as “fast coarse”.

### Behavior
- `played_note = base_note + transpose`
- Applies uniformly to:
  - Screen1 pad play (including latched notes)
  - Screen2 preview notes (Tune)
  - Incoming MIDI notes
- Display:
  - Update the bottom-right `Tr:=` indicator on Screen1 continuously (or only on change).
  - Keep existing bottom status messages working (do not overwrite transient status text).

### Persistence (optional)
- Store transpose separately (e.g. `/patches/global.json`) since it’s global.
- Backward compatible if the file/key is missing.
### Transpose persistence / saving rules (no autosave)
- **Default transpose:** `0` (especially when loading an older slot that has no transpose field).
- **Store transpose in the patch slot JSON** (so loading a performance patch is one step).
- **No autosave, ever.** Transpose changes are **volatile** until the user explicitly saves a slot.
- **Save slot:** write current `transpose` into the slot JSON (e.g. `"transpose": -3`).
- **Load slot:** if `transpose` is missing, use `0`.
- **Do not write** transpose anywhere except during an explicit **Save** action.
