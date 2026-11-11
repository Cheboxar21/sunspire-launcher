"""Synthesize a 36-second retro-electronic track for the Sunspire motion preview.
No external samples, no copyright issues. 120 BPM, A minor, synthwave/chiptune.
"""

import math
import wave
from pathlib import Path

import numpy as np

SR = 44100
DURATION = 36.0
BPM = 120.0
BEAT = 60.0 / BPM
BAR = BEAT * 4
N = int(SR * DURATION)
t = np.arange(N, dtype=np.float64) / SR
rng = np.random.default_rng(20261111)


def env_local(length, attack=0.01, decay=0.15, sustain=0.7, release=0.2):
    n = max(1, int(length * SR))
    e = np.zeros(n, dtype=np.float64)
    a = min(int(attack * SR), n)
    d = min(int(decay * SR), max(0, n - a))
    r = min(int(release * SR), max(0, n - a - d))
    sus = max(0, n - a - d - r)
    idx = 0
    if a:
        e[idx:idx + a] = np.linspace(0, 1, a)
        idx += a
    if d:
        e[idx:idx + d] = np.linspace(1, sustain, d)
        idx += d
    if sus:
        e[idx:idx + sus] = sustain
        idx += sus
    if r:
        e[idx:idx + r] = np.linspace(sustain, 0, r)
    return e


def osc_saw(freq, tt, phase=0.0):
    return 2.0 * ((tt * freq + phase) % 1.0) - 1.0


def osc_square(freq, tt, phase=0.0):
    return np.sign(np.sin(2 * np.pi * (tt * freq + phase)))


def osc_sine(freq, tt, phase=0.0):
    return np.sin(2 * np.pi * (tt * freq + phase))


def lowpass_local(signal, taps=64):
    kernel = np.ones(taps) / taps
    return np.convolve(signal, kernel, mode='same')


def note(name):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6,
             'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    if len(name) == 2:
        pitch, octave = name[0], int(name[1])
    else:
        pitch, octave = name[:2], int(name[2])
    midi = 12 * (octave + 1) + names[pitch]
    return 440.0 * (2 ** ((midi - 69) / 12))


def saw(freq, phase=0.0):
    return 2.0 * ((t * freq + phase) % 1.0) - 1.0


def square(freq, phase=0.0):
    return np.sign(np.sin(2 * np.pi * (t * freq + phase)))


def sine(freq, phase=0.0):
    return np.sin(2 * np.pi * (t * freq + phase))


def lowpass(signal, taps=64):
    kernel = np.ones(taps) / taps
    return np.convolve(signal, kernel, mode='same')


def highpass(signal, taps=64):
    return signal - lowpass(signal, taps)


def add(buf, signal, start, gain=1.0):
    begin = int(start * SR)
    if begin >= N:
        return
    end = min(N, begin + len(signal))
    buf[begin:end] += signal[:end - begin] * gain


def kick(start, gain=1.0):
    dur = 0.34
    n = int(dur * SR)
    tt = np.arange(n) / SR
    freq = 46 + 130 * np.exp(-tt * 24)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * np.exp(-tt * 7.0)
    click = rng.normal(0, 0.18, n) * np.exp(-tt * 55)
    return (body + click) * gain


def snare(start, gain=1.0):
    dur = 0.28
    n = int(dur * SR)
    tt = np.arange(n) / SR
    noise = rng.normal(0, 0.7, n)
    tone = np.sin(2 * np.pi * 185 * tt) * 0.5
    return (noise + tone) * np.exp(-tt * 15) * gain


def hat(start, gain=1.0, open_hat=False):
    dur = 0.12 if open_hat else 0.045
    n = int(dur * SR)
    tt = np.arange(n) / SR
    noise = rng.normal(0, 0.45, n)
    noise = highpass(noise, 12)
    return noise * np.exp(-tt * (60 if open_hat else 130)) * gain


def bass_note(freq, start, length, gain=0.5):
    n = int(length * SR)
    tt = np.arange(n) / SR
    e = env_local(length, 0.005, 0.05, 0.8, 0.04)
    tone = osc_saw(freq, tt) * 0.65 + osc_square(freq * 0.5, tt) * 0.35
    tone = lowpass_local(tone, 42)
    return tone * e * gain


def arp_note(freq, start, length, gain=0.18):
    n = int(length * SR)
    tt = np.arange(n) / SR
    e = env_local(length, 0.003, 0.03, 0.25, 0.03)
    return osc_square(freq, tt) * e * gain


def pad_chord(freqs, start, length, gain=0.18):
    n = int(length * SR)
    tt = np.arange(n) / SR
    e = env_local(length, 0.25, 0.4, 0.65, 0.4)
    tone = np.zeros(n, dtype=np.float64)
    for f in freqs:
        tone += osc_saw(f, tt) * 0.55 + osc_saw(f * 1.005, tt) * 0.25 + osc_sine(f * 0.5, tt) * 0.2
    tone = lowpass_local(tone, 120)
    # Sidechain-style pumping inside the pad.
    duck = 1.0 - 0.55 * np.exp(-((tt % BEAT) / 0.09))
    return tone * e * duck * gain


def sidechain(start, length, depth=0.55):
    e = np.ones(N, dtype=np.float64)
    begin = int(start * SR)
    end = min(N, begin + int(length * SR))
    if begin < end:
        n = end - begin
        tt = np.arange(n) / SR
        e[begin:end] = 1.0 - depth * np.exp(-tt * 10)
    return e


# Chord progression: Am, F, C, G (one bar each)
progression = [
    ('A', ['A2', 'C3', 'E3'], 'A1'),
    ('F', ['F2', 'A2', 'C3'], 'F1'),
    ('C', ['C3', 'E3', 'G3'], 'C2'),
    ('G', ['G2', 'B2', 'D3'], 'G1'),
]

drums = np.zeros(N, dtype=np.float64)
bass = np.zeros(N, dtype=np.float64)
arp = np.zeros(N, dtype=np.float64)
pad = np.zeros(N, dtype=np.float64)
lead = np.zeros(N, dtype=np.float64)
fx = np.zeros(N, dtype=np.float64)

# Intro 0-4s: filtered pad + arp, no kick until 4s.
for bar in range(2):
    start = bar * BAR
    root, chord, _ = progression[bar % 4]
    add(pad, pad_chord([note(n) for n in chord], start, BAR * 0.98, 0.16), start, 1.0)
    for step in range(16):
        f = note(chord[step % len(chord)]) * 4
        add(arp, arp_note(f, start + step * BAR / 16, BAR / 20, 0.10), start + step * BAR / 16, 1.0)

# Riser into the drop at 4s.
riser_n = int(1.2 * SR)
riser_t = np.arange(riser_n) / SR
riser = rng.normal(0, 0.12, riser_n) * np.linspace(0, 1, riser_n) ** 2
add(fx, riser, 2.8, 1.0)
add(fx, np.sin(2 * np.pi * 110 * riser_t) * np.linspace(0, 1, riser_n) ** 2 * 0.12, 2.8, 1.0)

# Main section 4-36s.
for bar in range(2, 18):
    start = bar * BAR
    root, chord, bass_name = progression[bar % 4]
    chord_freqs = [note(n) for n in chord]
    bass_freq = note(bass_name)

    # Kick four-on-floor.
    for beat in range(4):
        add(drums, kick(start + beat * BEAT, 0.95 if beat == 0 else 0.8), start + beat * BEAT, 1.0)
    # Snare on 2 and 4.
    add(drums, snare(start + 1 * BEAT, 0.42), start + 1 * BEAT, 1.0)
    add(drums, snare(start + 3 * BEAT, 0.42), start + 3 * BEAT, 1.0)
    # Hats on 8ths, open hat on off-beats.
    for step in range(8):
        add(drums, hat(start + step * BEAT / 2, 0.16 if step % 2 else 0.1, open_hat=(step == 7)), start + step * BEAT / 2, 1.0)

    # Bass: 8th-note pulse with octave movement.
    for step in range(8):
        freq = bass_freq * (2 if step in (3, 7) else 1)
        add(bass, bass_note(freq, start + step * BEAT / 2, BEAT / 2 * 0.9, 0.5), start + step * BEAT / 2, 1.0)

    # Arp: 16th-note chord tones, up/down.
    pattern = [0, 1, 2, 1, 0, 2, 1, 2] * 2
    for step in range(16):
        f = chord_freqs[pattern[step] % len(chord_freqs)] * 4
        add(arp, arp_note(f, start + step * BAR / 16, BAR / 22, 0.13), start + step * BAR / 16, 1.0)

    # Pad with sidechain (the local pad envelope already ducks on each beat).
    add(pad, pad_chord(chord_freqs, start, BAR * 0.98, 0.12), start, 1.0)

# Lead melody in the last 8 bars (28-36s).
lead_notes = [
    ('E5', 0.0, 0.5), ('G5', 0.5, 0.5), ('A5', 1.0, 1.0),
    ('G5', 2.0, 0.5), ('E5', 2.5, 0.5), ('D5', 3.0, 1.0),
    ('C5', 4.0, 0.5), ('E5', 4.5, 0.5), ('G5', 5.0, 1.0),
    ('E5', 6.0, 0.5), ('D5', 6.5, 0.5), ('C5', 7.0, 0.5), ('A4', 7.5, 0.5),
]
lead_start = 28.0
for name, offset, length in lead_notes:
    f = note(name)
    n = int(length * SR)
    tt = np.arange(n) / SR
    e = env_local(length, 0.01, 0.08, 0.6, 0.15)
    tone = osc_square(f, tt) * 0.45 + osc_saw(f * 1.002, tt) * 0.25 + osc_sine(f * 2, tt) * 0.1
    tone = lowpass_local(tone, 24)
    add(lead, tone * e, lead_start + offset, 0.22)

# Delay on arp and lead.
def delay(signal, seconds, feedback=0.28, mix=0.28):
    d = int(seconds * SR)
    out = np.zeros(N, dtype=np.float64)
    out[:] = signal
    for i in range(1, 5):
        shift = d * i
        if shift >= N:
            break
        out[shift:] += signal[:N - shift] * (feedback ** i) * mix
    return out

arp = delay(arp, BEAT * 0.75, 0.35, 0.35)
lead = delay(lead, BEAT, 0.22, 0.25)

# Mix.
mix = (
    drums * 0.95
    + bass * 0.9
    + arp * 0.85
    + pad * 0.9
    + lead * 0.75
    + fx * 0.35
)

# Simple stereo width: arp/pad slightly panned, bass/drums centered.
left = mix.copy()
right = mix.copy()
left += arp * 0.12
right -= arp * 0.12
left += pad * 0.05
right -= pad * 0.05

# High-pass to remove DC and a touch of low mud.
left = highpass(left, 220)
right = highpass(right, 220)

# Saturation and soft limiting.
left = np.tanh(left * 1.15)
right = np.tanh(right * 1.15)

# Fade in/out.
fade_in = int(0.15 * SR)
fade_out = int(1.0 * SR)
left[:fade_in] *= np.linspace(0, 1, fade_in)
right[:fade_in] *= np.linspace(0, 1, fade_in)
left[-fade_out:] *= np.linspace(1, 0, fade_out)
right[-fade_out:] *= np.linspace(1, 0, fade_out)

peak = max(np.max(np.abs(left)), np.max(np.abs(right)), 1e-9)
left = left / peak * 0.92
right = right / peak * 0.92

stereo = np.stack([left, right], axis=1)
pcm = np.clip(stereo * 32767.0, -32768, 32767).astype(np.int16)

out = Path(__file__).with_name('music.wav')
with wave.open(str(out), 'wb') as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes(pcm.tobytes())

print(f'wrote {out} ({DURATION:.1f}s, {pcm.shape[0]} frames)')
