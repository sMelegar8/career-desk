"""Sintesi procedurale dei suoni ASMR (vetro che si spacca, chicchi che tintinnano)."""
import random
import wave

import numpy as np

SR = 48_000


def _env(n, decay):
    t = np.arange(n) / SR
    return np.exp(-t / decay)


def _bandpassed_noise(n, low, high, rng):
    spec = np.fft.rfft(rng.standard_normal(n))
    freqs = np.fft.rfftfreq(n, 1 / SR)
    spec[(freqs < low) | (freqs > high)] = 0
    out = np.fft.irfft(spec, n)
    return out / (np.abs(out).max() + 1e-9)


def _ping(freq, decay, length, rng):
    """Inharmonic glass partials."""
    n = int(length * SR)
    t = np.arange(n) / SR
    tone = np.zeros(n)
    for ratio, amp in ((1.0, 1.0), (2.76, 0.5), (5.40, 0.25), (8.93, 0.12)):
        if freq * ratio > 16_000:  # above this the partial would alias into harsh noise
            continue
        tone +=amp * np.sin(2 * np.pi * freq * ratio * t + rng.uniform(0, 6.28))
    return tone * _env(n, decay)


def _place(track, sound, t, gain, pan):
    i = int(t * SR)
    if i >= track.shape[1]:
        return
    sound = sound[: track.shape[1] - i]
    track[0, i:i + len(sound)] += sound * gain * (1 - pan)
    track[1, i:i + len(sound)] += sound * gain * (1 + pan)


def render_glass_track(path, duration, cracks=(), tinkles=(), seed=1):
    rng = np.random.default_rng(seed)
    random.seed(seed)
    n = int(duration * SR)
    track = np.zeros((2, n))

    # room tone so silence never sounds digital
    track += 0.002 * _bandpassed_noise(n, 80, 4000, rng)

    for t in cracks:
        crunch = _bandpassed_noise(int(0.09 * SR), 1500, 11000, rng) * _env(int(0.09 * SR), 0.018)
        thump = np.sin(2 * np.pi * 95 * np.arange(int(0.12 * SR)) / SR) * _env(int(0.12 * SR), 0.03)
        _place(track, crunch, t, 0.55, rng.uniform(-0.2, 0.2))
        _place(track, thump, t, 0.35, 0)
        for _ in range(4):
            _place(track, _ping(rng.uniform(2500, 7000), rng.uniform(0.05, 0.12), 0.4, rng),
                   t + rng.uniform(0, 0.04), 0.12, rng.uniform(-0.5, 0.5))

    last = -1.0
    for t, amp in sorted(tinkles):
        if t - last < 0.006:  # avoid machine-gun clusters
            continue
        last = t
        _place(track, _ping(rng.uniform(2200, 6500), rng.uniform(0.12, 0.35), 0.8, rng),
               t, 0.05 + 0.15 * amp, rng.uniform(-0.7, 0.7))

    peak = np.abs(track).max()
    if peak > 0:
        track *= 0.9 / peak
    pcm = (track.T * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def render_lava_track(path, duration, cracks=(), sizzle_from=None, thuds=(), seed=2):
    """Rocky crunches, continuous sizzle with ember crackles, deep rumble."""
    rng = np.random.default_rng(seed)
    n = int(duration * SR)
    track = np.zeros((2, n))
    t = np.arange(n) / SR

    track += 0.004 * _bandpassed_noise(n, 30, 400, rng)  # low rumble bed
    rumble = 0.05 * np.sin(2 * np.pi * 48 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.3 * t))
    track += rumble

    if sizzle_from is not None:
        start = int(max(0.0, sizzle_from) * SR)
        if start < n:
            m = n - start
            fade = np.minimum(1.0, np.arange(m) / (0.6 * SR))
            sizzle = _bandpassed_noise(m, 3000, 11000, rng) * fade * 0.06
            track[0, start:] += sizzle
            track[1, start:] += _bandpassed_noise(m, 3000, 11000, rng) * fade * 0.06
            for ct in np.sort(rng.uniform(sizzle_from, duration, int((duration - sizzle_from) * 18))):
                click = _bandpassed_noise(int(0.012 * SR), 1500, 9000, rng) * _env(int(0.012 * SR), 0.003)
                _place(track, click, ct, rng.uniform(0.05, 0.2), rng.uniform(-0.8, 0.8))

    for ct in cracks:
        crunch = _bandpassed_noise(int(0.16 * SR), 200, 5000, rng) * _env(int(0.16 * SR), 0.04)
        thump = np.sin(2 * np.pi * 70 * np.arange(int(0.2 * SR)) / SR) * _env(int(0.2 * SR), 0.05)
        _place(track, crunch, ct, 0.6, rng.uniform(-0.15, 0.15))
        _place(track, thump, ct, 0.45, 0)

    for ct in thuds:
        boom = np.sin(2 * np.pi * 55 * np.arange(int(0.5 * SR)) / SR) * _env(int(0.5 * SR), 0.12)
        debris = _bandpassed_noise(int(0.3 * SR), 300, 6000, rng) * _env(int(0.3 * SR), 0.06)
        _place(track, boom, ct, 0.7, 0)
        _place(track, debris, ct + 0.01, 0.35, 0)

    peak = np.abs(track).max()
    if peak > 0:
        track *= 0.9 / peak
    pcm = (track.T * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
