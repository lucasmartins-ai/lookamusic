/**
 * Harmonic function (Phase 3, §15). Pure — no React, no Web Audio.
 *
 * Major key (degrees I–vii°):
 *   TONIC = I, iii, vi · SUBDOMINANT = ii, IV · DOMINANT = V, vii°.
 * Minor key (functional set i, iv, V/VII + diatonic neighbours):
 *   TONIC = i, III · SUBDOMINANT = ii°, iv, VI · DOMINANT = v/V, VII/vii°.
 * Anything chromatic or with a non-diatonic quality (e.g. sus on a
 * non-matching degree) → UNKNOWN. Extensions/inversion are ignored.
 */
import type { Chord, HarmonicFunction, KeyEstimate } from "@/domain/types";

function degree(chordRoot: number, keyRoot: number): number {
  return (((Math.round(chordRoot) - Math.round(keyRoot)) % 12) + 12) % 12;
}

/**
 * Chord + key → TONIC | SUBDOMINANT | DOMINANT | UNKNOWN.
 * Seventh on V (dom7) counts as dominant; maj7/min7 elsewhere only match
 * where diatonic (V/maj7 is not diatonic → UNKNOWN by design).
 */
export function getFunction(chord: Chord, key: KeyEstimate): HarmonicFunction {
  const d = degree(chord.root, key.root);
  const q = chord.quality;

  if (key.mode === "major") {
    switch (d) {
      case 0: // I
        return q === "major" ? "TONIC" : "UNKNOWN";
      case 2: // ii
        return q === "minor" || q === "min7" ? "SUBDOMINANT" : "UNKNOWN";
      case 4: // iii
        return q === "minor" ? "TONIC" : "UNKNOWN";
      case 5: // IV
        return q === "major" ? "SUBDOMINANT" : "UNKNOWN";
      case 7: // V
        return q === "major" || q === "dom7" ? "DOMINANT" : "UNKNOWN";
      case 9: // vi
        return q === "minor" ? "TONIC" : "UNKNOWN";
      case 11: // vii°
        return q === "diminished" ? "DOMINANT" : "UNKNOWN";
      default:
        return "UNKNOWN";
    }
  }

  // minor
  switch (d) {
    case 0: // i
      return q === "minor" || q === "min7" ? "TONIC" : "UNKNOWN";
    case 2: // ii°
      return q === "diminished" ? "SUBDOMINANT" : "UNKNOWN";
    case 3: // III (relative major)
      return q === "major" ? "TONIC" : "UNKNOWN";
    case 5: // iv
      return q === "minor" || q === "min7" ? "SUBDOMINANT" : "UNKNOWN";
    case 7: // v (natural) / V (harmonic)
      return q === "minor" || q === "major" || q === "dom7" ? "DOMINANT" : "UNKNOWN";
    case 8: // VI
      return q === "major" ? "SUBDOMINANT" : "UNKNOWN";
    case 10: // VII (natural major)
      return q === "major" ? "DOMINANT" : "UNKNOWN";
    case 11: // vii° (harmonic leading-tone)
      return q === "diminished" ? "DOMINANT" : "UNKNOWN";
    default:
      return "UNKNOWN";
  }
}
