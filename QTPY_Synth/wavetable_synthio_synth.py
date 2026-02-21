#
# wavetable_synthio_synth.py -- Demonstrate new synthio.Synthesizer as wavetable MIDI synth
# 15 Apr 2023 - @todbot / Tod Kurt
# video demo: https://www.youtube.com/watch?v=uUnS3nR2K-8
#
# Hooked up to generic I2S DAC
# Uses two pots:
#  knobA - selects the base wave
#  knobB - selects the mix between base wave and next wave
#

import time
import board
import analogio
import audiobusio, audiomixer
import synthio
import ulab.numpy as np
import usb_midi
import adafruit_midi
from adafruit_midi.note_on import NoteOn
from adafruit_midi.note_off import NoteOff
import neopixel

#from waveforms_akwf_0018 import waveforms, waveforms_names
from waveforms_akwf_granular import waveforms, waveforms_names
num_waveforms = len(waveforms)

SAMPLE_RATE = 28000  # clicks @ 36kHz & 48kHz on rp2040
SAMPLE_SIZE = len(waveforms[0])
VOLUME = 4000

# pimoroni pico dv board
# lck_pin, bck_pin, dat_pin  = board.GP28, board.GP27, board.GP26
# qtpy rp2040 SPI pins
lck_pin, bck_pin, dat_pin  = board.MISO, board.MOSI, board.SCK
knobA_pin = board.A1
knobB_pin = board.A2

# map s range a1-a2 to b1-b2
def map_range(s, a1, a2, b1, b2):  return  b1 + ((s - a1) * (b2 - b1) / (a2 - a1))

# mix between values a and b, works with numpy arrays too, t ranges 0-1
def lerp(a, b, t):  return (1-t)*a + t*b

def make_amp_envelope(velocity=127):
    max_time = 200     # let's declare we have this many units of time to use
    attack_time = int(map_range(velocity, 0,127, 99, 50)) # allow 50-99 units for attack, hard vel=faster attack
    release_time = int(map_range(velocity, 0,127, 50, 99)) # allow 50-99 units for release
    sustain_time = max_time - attack_time - release_time  # sustain gets remainder (sustain by synth, not env)
    print("sustain_time:",sustain_time)
    peak_level = 1  # or map_range(velocity, 0,127, 0.3,1)
    adsr = np.array( np.concatenate((
                np.linspace(.1, peak_level, num=attack_time, endpoint=False),
                np.linspace(peak_level, peak_level, num=sustain_time, endpoint=False),  # filler
                np.linspace(peak_level, 0, num=release_time, endpoint=True)**2,  # exp decay
            )) * 32767, dtype=np.int16 )
    return (adsr, 100+sustain_time)  # FIXME: has to be longest possible attack time


# synth engine setup
(amp_env,hold_index) = make_amp_envelope(10)
print("hold_index:", hold_index, "amp_env:", list(amp_env))

waveform = np.zeros(SAMPLE_SIZE, dtype=np.int16)  # intially all zeros (silence)
synth = synthio.Synthesizer(sample_rate=SAMPLE_RATE, waveform=waveform,
                            envelope=amp_env, envelope_sustain_index=hold_index )

audio = audiobusio.I2SOut(bit_clock=bck_pin, word_select=lck_pin, data=dat_pin)
mixer = audiomixer.Mixer(voice_count=1, sample_rate=SAMPLE_RATE, channel_count=1,
                         bits_per_sample=16, samples_signed=True, buffer_size=2048 )
audio.play(mixer)
mixer.voice[0].play(synth)

midi = adafruit_midi.MIDI(midi_in=usb_midi.ports[0], in_channel=0 )

# waveforms setup
saw = np.linspace(VOLUME, -VOLUME, num=SAMPLE_SIZE, dtype=np.int16)
sine = np.array(np.sin(np.linspace(0, 2*np.pi, SAMPLE_SIZE, endpoint=False)) * VOLUME, dtype=np.int16)
waveform[:] = saw

# knob & LED setup
led = neopixel.NeoPixel(board.NEOPIXEL, 1, brightness=0.2)
knobA = analogio.AnalogIn(knobA_pin)
knobB = analogio.AnalogIn(knobB_pin)
knobA_val = knobA.value
knobB_val = knobB.value
knob_filt = 0.8  # simple low-pass filter on noisy knobs
wave_index = 0
wave_mix = 0
last_debug_time = time.monotonic()

print("wavetable_synthio_synth ready")

while True:
    # handle midi
    msg = midi.receive()
    if isinstance(msg, NoteOn) and msg.velocity != 0:
        print("noteOn: ", msg.note)
        led.fill(0xff00ff)
        (amp_env[:], hold_i ) = make_amp_envelope(msg.velocity)
        synth.press( (msg.note,) )
    elif isinstance(msg,NoteOff) or isinstance(msg,NoteOn) and msg.velocity==0:
        print("noteOff:", msg.note)
        led.fill(0x00000)
        synth.release_then_press( release=(msg.note,), press=() ) # no ".release()"

    # handle knobs
    knobA_val = knob_filt * knobA_val + (1-knob_filt)* knobA.value
    knobB_val = knob_filt * knobB_val + (1-knob_filt)* knobB.value
    wave_index = int((num_waveforms-1) * knobA_val // 65535)  # map knobA_val to wavetable index
    wave_mix =  1.0 * knobB_val / 65535
    waveform[:] = lerp( waveforms[wave_index], waveforms[wave_index+1], wave_mix )

    # debug info
    if time.monotonic() - last_debug_time > 0.5:
        last_debug_time = time.monotonic()
        print("wave_index:",wave_index,"wave_mix:",wave_mix)

