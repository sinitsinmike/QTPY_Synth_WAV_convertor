# Future Features TODO (qtpy_synth wavesynth)

## 1) Save/Load TUNE data inside patch slots

**Goal:** When saving/loading a slot (`/patches/slot_XXX.json`), include per-pad tuning so pads retain their tuned note after reboot / patch change.

### Data to persist (per slot)
- `tune.pad_note_int[4]` — **int** (MIDI note number)
- `tune.pad_fine_cents[4]` — **int** (-100..+100)
- *(optional)* `tune.latch_states[4]` — **bool** (if you want latch state restored)

### Where to implement
- `code.py` → inside `input_handler()`:
  - Extend `patch_to_dict()` to include a `"tune": {...}` section.
  - Extend `load_slot()` to read `"tune"` (if present) and restore:
    - `pad_note_int[]`
    - `pad_fine_cents[]`
    - *(optional)* `latch_states[]`

### Compatibility / safety
- If `"tune"` is missing in older slot files, defaults remain unchanged (no crash).
- Clamp values on load:
  - `pad_note_int`: reasonable MIDI range (e.g. 0..127)
  - `pad_fine_cents`: -100..+100

---

## 2) Screen #2 bottom area: ARP option (mutually exclusive with LATCH)

**Goal:** Add a simple arpeggiator on Screen #2 using the free bottom line area.  
ARP uses the 4 existing pad notes as the chord/scale and plays them in a selected order.

### UI parameters
- `Arp: ON/OFF`
- `ArpShape:` `UP | DOWN | UPDOWN | DOWNUP`

### Musical behavior
- **Root note** = the pressed pad (touch press).  
- **Playable set** = the 4 tuned pad notes (using `pad_note_int + pad_fine_cents/100.0`).
- ARP outputs only from those 4 notes (no extra pitches).

### Interaction with LATCH (choose one rule)
Recommended: **ARP ON forces LATCH OFF**
- When enabling ARP, set `latch_states = [False, False, False, False]` and update display.
- Prevents two “hold” systems from fighting each other.

### Where to implement
- `code.py` → inside `input_handler()`:
  - Add state:
    - `arp_on: bool`
    - `arp_shape: int` (0..3)
    - `arp_root_pad: int | None`
    - `arp_step_idx`, `arp_last_time`, `arp_period_ms` (or `arp_rate_hz`)
    - `arp_current_note` for note_off tracking
  - In touch handling:
    - If `arp_on`: touch press starts ARP using pressed pad as root; touch release stops ARP and note_off current note.
    - If `arp_off`: current behavior unchanged.
  - In the main loop:
    - If `arp_on` and a root is active: advance steps on a timer and trigger note_on/note_off.

### Display support
- `wavesynth_display.py`:
  - Add a helper like `set_arp(on: bool, shape: str)` **or** reuse `display_status()` for bottom-line updates.

### Future extension (optional)
- Add `ArpRate` control (pot / MIDI clock / fixed presets).