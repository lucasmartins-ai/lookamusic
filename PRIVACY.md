# PRIVACY — LookaMusic (Phase 15 Final Release)

> Short version: **your voice and your camera never leave this device.**
> No account, no uploads, no analytics. Everything runs locally in your browser.

## Why the microphone

The instrument is your voice: pitch, timing and loudness drive melody,
tempo and energy. The app asks for microphone access **only** when you press
START (or the onboarding button) — never on page load, never silently.

Before the browser's native permission dialog appears, the app shows a
pre-explain card: what will be used, and that audio stays on-device.

## Why the camera (optional)

Camera enables conducting with hand gestures (open/close hand, fingers,
swipes). It is **entirely optional**: every gesture has a button and a
keyboard equivalent with full parity.

Before requesting, the app shows a pre-explain card. The stream is
video-only (no audio). Frames are classified **in memory, on-device**;
they are never recorded, uploaded, persisted, or sent anywhere.

## What leaves the device

**Nothing, by default.** There is no server receiving audio, video, notes
or usage data in Phases 1–16. Specifically:

| Data | Where it goes |
|---|---|
| Raw microphone audio | Nowhere — processed locally via AudioWorklet, never stored |
| Camera frames | Nowhere — classified in memory on-device, discarded immediately |
| Detected notes / chords / tempo | Browser memory only |
| Educational explanations | Computed in pure TypeScript locally (zero LLM / cloud APIs) |
| Exported files (WAV/MIDI/JSON/WebM) | Rendered in-browser, saved directly to your local downloads |
| Onboarding & settings | `localStorage` on this browser only |
| Diagnostics (latency, RMS) | Screen only, while visible |

No third-party trackers, no cookies for advertising, no ML inference in
the cloud. The hand-tracking model (when enabled) downloads to the browser
and runs locally via WebAssembly/WebGPU.

## Recordings & Projects (Phase 11–15)

Session capture/replay stores **structured musical data locally**
(IndexedDB / local files chosen by you). To remove: delete the project
inside the app (`/compose`), or clear site data in the browser settings
(Chrome: Settings → Privacy → Delete browsing data → hosted app data).
There is no server copy to request — because none exists.

## Real instrument sound — native models + bundled packs (Phase 16 / v1.3.3)

Piano, violão and drums sound like real instruments. Nothing is requested
from the network and nothing is uploaded — the guarantees above are intact:

- **Shipped inside the app (v1.3.3).** The recorded one-shots live in
  `public/samples/**` and are served from the app's own origin (web/PWA and
the desktop installer). There is **no download step, no "consent" button and
  no network request** to play them: the app decodes its own files on first
  use and keeps playing offline forever.
- **Native additive models (default fallback).** When a recorded buffer is
  still decoding — or the runtime cannot decode mp3 — the engine synthesizes
  the instrument from an additive partial bank defined in code. That is why
  there is never silence and never an error dialog: the sound is always
  available on-device.
- **What is bundled:** only compressed audio notes/one-shots from the sources
  credited on the in-app credits screen (Salamander Grand Piano, CC-BY-3.0;
  FreePats nylon guitar and percussion, CC0). Repackaged to mono mp3 with a
  fade (see `scripts/fetch-sample-packs.mjs`); no microphone audio, no usage
  data, no identifier.
- **Where packs live:** decoded in memory (and optionally the browser
  `Cache API`) on this device. Clear site data to remove them. Nothing is
  uploaded anywhere, ever.
- **Per-instrument choice:** the "Som real / Sintetizador" toggle applies
  instantly and is stored in `localStorage` on this browser only.

## If you deny permission

Denial is a first-class state, never a dead end: the app shows what
happened and how to recover (allow in the address-bar icon, connect a
microphone, or continue without camera). The no-mic fixture path
(`/session` → SING FIXTURE) lets anyone explore the band with zero
permissions granted.

## Changes to this policy

Future cloud features (if any) will be **opt-in**, will update this file
first, and will never silently exfiltrate past local data.
