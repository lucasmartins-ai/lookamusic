/**
 * NoteTimeline — event-sourced melody view (Phase 2, §36).
 * Renders stable note blocks + phrase spans + bar lines from domain events.
 * No samples, no animation loop: a static rolling window anchored to the
 * latest event, so it is still under prefers-reduced-motion.
 */
import { midiToNoteName } from "@/features/pitch/conversions";
import type { TimelineNote, TimelinePhrase } from "@/features/music/useMusicPipeline";

/** Rolling view width (UI layout const, cf. PitchCanvas grid lines). */
const WINDOW_SEC = 8;
/** Minimum visible block width in seconds (legibility floor). */
const MIN_BLOCK_SEC = 0.12;
/** Phase 2 renders 4/4; meter tracking lands in Phase 5. */
const BEATS_PER_BAR = 4;

interface Props {
  notes: TimelineNote[];
  phrases: TimelinePhrase[];
  /** Playback BPM, or null before any tempo evidence. */
  bpm: number | null;
}

export function NoteTimeline({ notes, phrases, bpm }: Props) {
  if (notes.length === 0 && phrases.length === 0) {
    return (
      <div className="timeline tl-empty" role="img" aria-label="Note timeline is empty">
        Sing a phrase — stable notes appear here as blocks.
      </div>
    );
  }

  let t1 = 0;
  for (const n of notes) t1 = Math.max(t1, n.startTime + (n.open ? 0 : n.duration), n.startTime);
  for (const p of phrases) t1 = Math.max(t1, p.endTime ?? p.startTime);
  const t0 = t1 - WINDOW_SEC;
  const x = (t: number) => Math.max(0, Math.min(1, (t - t0) / WINDOW_SEC));

  const midis = notes.map((n) => n.midi);
  const lo = Math.min(...midis, 72) - 2;
  const hi = Math.max(...midis, 60) + 2;
  const y = (m: number) => 1 - (m - lo) / Math.max(1, hi - lo);

  const bars: number[] = [];
  if (bpm && bpm > 0) {
    const barSec = (60 / bpm) * BEATS_PER_BAR;
    const first = Math.ceil(t0 / barSec) * barSec;
    for (let b = first; b <= t1; b += barSec) bars.push(b);
  }

  const label = `${notes.length} note${notes.length === 1 ? "" : "s"}${
    phrases.length > 0 ? `, ${phrases.length} phrase${phrases.length === 1 ? "" : "s"}` : ""
  }${bpm ? `, ${Math.round(bpm)} BPM` : ""}`;

  return (
    <div className="timeline" role="img" aria-label={`Note timeline: ${label}`}>
      {bars.map((b) => (
        <div key={b.toFixed(3)} className="tl-bar" style={{ left: `${x(b) * 100}%` }} />
      ))}
      {notes.map((n) => {
        const end = n.open ? t1 : n.startTime + Math.max(n.duration, MIN_BLOCK_SEC);
        const left = x(n.startTime) * 100;
        const width = Math.max(0.6, (x(end) - x(n.startTime)) * 100);
        const top = y(n.midi + 0.5) * 100;
        const height = Math.max(7, ((1 / Math.max(1, hi - lo)) * 100));
        return (
          <div
            key={n.id}
            className={`tl-note${n.open ? " open" : ""}`}
            style={{
              left: `${left}%`,
              width: `${width}%`,
              top: `calc(${top}% - ${height / 2}%)`,
              height: `${height}%`,
              opacity: 0.45 + 0.55 * Math.max(0, Math.min(1, n.velocity)),
            }}
            title={`${midiToNoteName(n.midi)} · ${n.duration.toFixed(2)}s`}
          >
            {width > 9 && <span>{midiToNoteName(n.midi)}</span>}
          </div>
        );
      })}
      <div className="tl-phrase-lane">
        {phrases.map((p) => {
          const end = p.endTime ?? t1;
          return (
            <div
              key={p.id}
              className={`tl-phrase${p.endTime === null ? " open" : ""}`}
              style={{ left: `${x(p.startTime) * 100}%`, width: `${Math.max(0.6, (x(end) - x(p.startTime)) * 100)}%` }}
            />
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {label}
      </p>
    </div>
  );
}
