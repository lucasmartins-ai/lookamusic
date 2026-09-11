# LookaMusic — Desktop Executable & Low-Latency Audio Guide

This guide documents the native desktop wrapper, low-latency audio configuration, real-time vocal feedback (Vocal Coach), and autotune architecture for **LookaMusic** across **Windows**, **macOS**, and **Linux**.

---

## 1. Multiplatform Architecture

LookaMusic uses an **Electron + Next.js** packaging architecture configured specifically for real-time digital signal processing (DSP):

- **Zero-Sandboxing Audio Latency**: Directly addresses the OS soundcard through Chromium's low-latency audio path.
- **Embedded Local Server**: The desktop main process (`electron/main.cjs`) initializes a secure localhost instance of Next.js, ensuring 100% feature parity with web routing (`/session`, `/compose/[id]`, `/learn`), IndexedDB persistence, and local AudioWorklet execution.
- **Microphone & Camera Entitlements**: Seamlessly requests and manages hardware media permissions across macOS, Windows, and Linux without address-bar prompts or browser blocking.

```
+-------------------------------------------------------------+
|                  LookaMusic Desktop Native                  |
|  +-------------------------------------------------------+  |
|  |             Electron Main (electron/main.cjs)         |  |
|  |   - Flags: --audio-buffer-size=256                    |  |
|  |   - Flags: --enable-exclusive-audio                   |  |
|  |   - Embedded Localhost Server (port discovery)        |  |
|  +-------------------------------------------------------+  |
|                               |                             |
|  +----------------------------v--------------------------+  |
|  |             Chromium Renderer Window                  |  |
|  |   - Web Audio AudioContext (latencyHint: interactive) |  |
|  |   - looka-pitch Worklet (Autocorrelation / YIN)       |  |
|  |   - looka-autotune Worklet (Phase-aligned pitch shift)|  |
|  |   - Conductor & 8-Instrument Real-time Engines        |  |
|  +-------------------------------------------------------+  |
+-------------------------------------------------------------+
```

---

## 2. Ultra-Low Input Lag (Audio Latency Optimization)

To deliver a truly responsive singing instrument where the user feels instantaneous musical feedback from the band and autotune:

1. **Audio Buffer Size**: 
   The desktop wrapper injects `--audio-buffer-size=256`. At 48kHz, a 256-sample buffer represents **~5.3 ms** of latency (compared to standard browser buffers of 1024–2048 samples / 40–80 ms).
2. **Exclusive Audio Mode**:
   `--enable-exclusive-audio` is passed to the Chromium command line. On Windows, this routes audio via WASAPI Exclusive mode when supported, bypassing OS-level mixer resampling overhead.
3. **Background Throttling Disabled**:
   `--disable-renderer-backgrounding` and `--disable-background-timer-throttling` ensure that musical ticks, AudioWorklet message loops, and scheduler horizons never drift even if the window loses focus.
4. **Interactive Context**:
   Web Audio contexts are created with `{ latencyHint: "interactive" }`.

### Platform Recommendations for Singers
- **Windows**: Use modern USB audio interfaces or high-definition audio drivers. WASAPI provides <10ms total round-trip.
- **macOS**: Core Audio natively handles 256-sample buffers with jitter < 1ms on both Apple Silicon (M1/M2/M3/M4) and Intel.
- **Linux**: Supported out of the box with ALSA, PulseAudio, and PipeWire (low-latency quantum `PIPEWIRE_LATENCY=256/48000`).

---

## 3. Real-Time Vocal Coach & Pedagogic Guidance

The Vocal Coach analyzes the singer's pitch in real time against either the chromatic scale or the active musical key scale detected by the Conductor:

- **Target Note & Cents Meter**: Computes exact deviation in cents (-50¢ to +50¢).
- **Intonation Zones**:
  - `AFINADO` (±12¢): Sweet spot in green. Emits encouraging feedback and advances the in-tune streak counter.
  - `BEMOL` (Flat, < -12¢): Alerts the singer that the pitch is below target, with advice to raise the voice slightly.
  - `SUSTENIDO` (Sharp, > +12¢): Alerts the singer that the pitch is above target, with advice to lower the voice slightly.
  - `FORA DO TOM`: Detects when a note is pitched accurately but belongs outside the currently established musical key (e.g., F# in C Major).
  - `INSTÁVEL / SEM NOTA`: Notifies the user when sound is detected but pitch confidence is too low, encouraging steady breath support and clear vowels.
- **Singing Accuracy Score**: Tracks percentage of voiced frames sustained in-tune over the session.

---

## 4. Real-Time Autotune (Pitch Correction)

The autotune engine operates directly on the Web Audio thread via `public/worklets/autotune-processor.js`:

- **DSP Architecture**: Phase-aligned dual-delay crossfading pitch shifter running in O(N) linear time with zero audio thread blocking.
- **Correction Speeds**:
  - **Natural (80ms)**: Subtle, humanized pitch correction that glides gently to pitch centers while preserving natural vocal vibrato.
  - **Pop (25ms)**: Modern commercial radio snap with immediate intonation stabilization.
  - **Robô / Hard (0ms)**: Instantaneous pitch quantization (the classic T-Pain / Cher electronic effect).
- **Scale Locking**:
  - **Cromático**: Snaps to the nearest of all 12 chromatic semitones.
  - **Escala da Música**: Automatically locks target notes to the degrees of the scale currently detected by the Conductor (e.g., major, natural minor).
- **Headphone Monitoring**:
  - Includes a dedicated monitor volume slider.
  - Safety advisory: Singers should wear headphones when enabling vocal return to prevent acoustic feedback loop with external speakers.

---

## 5. Building the Desktop Distributables

### Prerequisites
Install desktop packaging dependencies (when building native binaries):
```bash
npm install -D electron electron-builder
```

### Running Locally in Desktop Mode
```bash
npm run desktop:start
```

### Packaging for All Platforms

1. **macOS** (DMG & ZIP — Apple Silicon & Intel):
   ```bash
   npm run desktop:dist:mac
   ```
   *Outputs `.dmg` installer and `.zip` archive in `dist-electron/`.*

2. **Windows** (NSIS Installer `.exe` & Portable `.exe`):
   ```bash
   npm run desktop:dist:win
   ```
   *Outputs `LookaMusic Setup.exe` and `LookaMusic.exe` portable executable.*

3. **Linux** (AppImage & Debian `.deb`):
   ```bash
   npm run desktop:dist:linux
   ```
   *Outputs standalone `.AppImage` (runs on any modern distro) and `.deb` in `dist-electron/`.*

4. **Universal Build**:
   ```bash
   npm run desktop:build
   ```
