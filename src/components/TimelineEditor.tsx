"use client";

/**
 * TimelineEditor — visual timeline, note roll, chords, and mixer (Phase 11, §41).
 * Pure presentation + interaction: dispatches actions to editor.ts functions.
 * Operates purely on MusicalState/Composition, never modifies audio destructively.
 * Audio feedback on note selection/pitch changes, live playhead indicator, SVG icons.
 */
import { useMemo, useState } from "react";
import {
  INSTRUMENTS,
  type Chord,
  type ChordQuality,
  type Composition,
  type InstrumentId,
  type MidiNote,
} from "@/domain/types";
import {
  addNote,
  changeChord,
  changeNoteDuration,
  changeNotePitch,
  changeTempo,
  deleteNote,
  moveNote,
  quantizeMelody,
  regenerateAccompaniment,
  setInstrumentControl,
  toggleInstrumentMute,
} from "@/features/recording/editor";
import { midiToNoteName } from "@/features/pitch/conversions";
import {
  SaveIcon,
  PlusIcon,
  SlidersIcon,
  LightningIcon,
  TrashIcon,
} from "@/components/icons";

const PITCH_CLASSES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

const QUALITIES: ChordQuality[] = [
  "major",
  "minor",
  "diminished",
  "augmented",
  "dom7",
  "maj7",
  "min7",
  "sus2",
  "sus4",
];

interface TimelineEditorProps {
  composition: Composition;
  onChange: (updated: Composition) => void;
  onSave?: () => void;
  isSaving?: boolean;
  onPreviewNote?: (midi: number) => void;
  playheadSec?: number;
  isPlaying?: boolean;
}

export function TimelineEditor({
  composition,
  onChange,
  onSave,
  isSaving = false,
  onPreviewNote,
  playheadSec = 0,
  isPlaying = false,
}: TimelineEditorProps) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [quantizeGrid, setQuantizeGrid] = useState<number>(0.5);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedNote = useMemo(
    () => composition.melody.find((n) => n.id === selectedNoteId) ?? null,
    [composition.melody, selectedNoteId],
  );

  // Time metrics
  const totalDuration = useMemo(() => {
    let max = 4.0;
    for (const n of composition.melody) {
      if (n.startTime + n.duration > max) {
        max = n.startTime + n.duration;
      }
    }
    return Math.max(4.0, Math.ceil(max));
  }, [composition.melody]);

  const notify = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSelectNote = (id: string) => {
    if (selectedNoteId === id) {
      setSelectedNoteId(null);
    } else {
      setSelectedNoteId(id);
      const note = composition.melody.find((n) => n.id === id);
      if (note && onPreviewNote) {
        onPreviewNote(note.midi);
      }
    }
  };

  const handleMoveNote = (deltaSec: number) => {
    if (!selectedNote) return;
    const newStart = Math.max(0, selectedNote.startTime + deltaSec);
    const updated = moveNote(composition, selectedNote.id, newStart);
    onChange(updated);
  };

  const handleChangePitch = (deltaSemitones: number) => {
    if (!selectedNote) return;
    const newMidi = (selectedNote.midi + deltaSemitones) as MidiNote;
    const updated = changeNotePitch(composition, selectedNote.id, newMidi);
    onChange(updated);
    if (onPreviewNote) {
      onPreviewNote(newMidi);
    }
  };

  const handleChangeDuration = (deltaSec: number) => {
    if (!selectedNote) return;
    const newDur = Math.max(0.1, selectedNote.duration + deltaSec);
    const updated = changeNoteDuration(composition, selectedNote.id, newDur);
    onChange(updated);
  };

  const handleDeleteSelectedNote = () => {
    if (!selectedNote) return;
    const updated = deleteNote(composition, selectedNote.id);
    setSelectedNoteId(null);
    onChange(updated);
    notify("Nota removida.");
  };

  const handleAddNote = () => {
    const lastNote = composition.melody[composition.melody.length - 1];
    const newStart = lastNote ? lastNote.startTime + lastNote.duration + 0.25 : 0;
    const newMidi = 60;
    const updated = addNote(composition, {
      pitch: 261.63,
      midi: newMidi,
      startTime: newStart,
      duration: 0.5,
      velocity: 0.8,
      confidence: 1,
      source: "edited",
    });
    onChange(updated);
    if (onPreviewNote) {
      onPreviewNote(newMidi);
    }
    notify("Nova nota adicionada.");
  };

  const handleQuantize = () => {
    const updated = quantizeMelody(composition, quantizeGrid);
    onChange(updated);
    notify(`Melodia quantizada para grade ${quantizeGrid} tempo.`);
  };

  const handleRegenerateChords = () => {
    const updated = regenerateAccompaniment(composition);
    onChange(updated);
    notify("Acompanhamento regenerado com harmonia diatônica!");
  };

  const handleChordChange = (index: number, patch: Partial<Chord>) => {
    const current = composition.chords[index];
    if (!current) return;
    const updatedChord: Chord = {
      ...current.chord,
      ...patch,
    };
    const updated = changeChord(composition, index, updatedChord);
    onChange(updated);
  };

  return (
    <div className="timeline-editor" data-testid="timeline-editor">
      {statusMessage && (
        <div className="notice tone-info" role="status" aria-live="polite">
          {statusMessage}
        </div>
      )}

      {/* Global Composition Properties */}
      <section className="panel" aria-label="Propriedades da Composição">
        <h2>COMPOSIÇÃO</h2>
        <div className="controls">
          <label className="control-field">
            TEMPO (BPM)
            <input
              type="number"
              min={30}
              max={240}
              value={composition.tempo}
              onChange={(e) => {
                const bpm = parseInt(e.target.value, 10);
                if (!isNaN(bpm)) onChange(changeTempo(composition, bpm));
              }}
              data-testid="editor-bpm"
            />
          </label>
          <label className="control-field">
            FÓRMULA
            <input
              type="text"
              readOnly
              value={`${composition.timeSignature.numerator}/${composition.timeSignature.denominator}`}
              aria-label="Fórmula de compasso"
            />
          </label>
          <label className="control-field">
            TOM / ESCALA
            <input
              type="text"
              readOnly
              value={`${PITCH_CLASSES[composition.key.root]} ${composition.key.mode}`}
              aria-label="Tonalidade e modo"
            />
          </label>
          {onSave && (
            <button className="primary" onClick={onSave} disabled={isSaving} data-testid="editor-save">
              <SaveIcon size={14} /> {isSaving ? "SALVANDO…" : "SALVAR PROJETO"}
            </button>
          )}
        </div>
      </section>

      {/* Timeline Melody Roll */}
      <section className="panel" aria-label="Trilha Melódica">
        <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>MELODIA (NOTAS: {composition.melody.length})</h2>
          <div className="controls">
            <button className="ghost" onClick={handleAddNote} data-testid="btn-add-note">
              <PlusIcon size={14} /> ADICIONAR NOTA
            </button>
            <select
              value={quantizeGrid}
              onChange={(e) => setQuantizeGrid(parseFloat(e.target.value))}
              aria-label="Grade de quantização"
            >
              <option value={0.25}>1/16 (0.25 t)</option>
              <option value={0.5}>1/8 (0.50 t)</option>
              <option value={1.0}>1/4 (1.00 t)</option>
            </select>
            <button className="ghost" onClick={handleQuantize} data-testid="btn-quantize">
              <SlidersIcon size={14} /> QUANTIZAR
            </button>
          </div>
        </div>

        {/* Visual Note Strip */}
        <div
          className="note-strip neu-well"
          role="region"
          aria-label="Visualizador de notas da melodia"
          style={{
            position: "relative",
            minHeight: "120px",
            borderRadius: "6px",
            border: "1px solid var(--line)",
            overflowX: "auto",
            marginTop: "12px",
            padding: "8px 0",
          }}
        >
          {/* Active Playhead Indicator */}
          {isPlaying && playheadSec >= 0 && (
            <div
              style={{
                position: "absolute",
                left: `${Math.min(100, (playheadSec / totalDuration) * 100)}%`,
                top: 0,
                bottom: 0,
                width: "2px",
                background: "#f59e0b",
                boxShadow: "0 0 10px #f59e0b, 0 0 16px rgba(245,158,11,0.8)",
                zIndex: 10,
                pointerEvents: "none",
                transition: "left 0.04s linear",
              }}
            />
          )}

          {composition.melody.map((note) => {
            const leftPercent = (note.startTime / totalDuration) * 100;
            const widthPercent = Math.max(2, (note.duration / totalDuration) * 100);
            const isSelected = note.id === selectedNoteId;

            return (
              <button
                key={note.id}
                type="button"
                onClick={() => handleSelectNote(note.id)}
                aria-pressed={isSelected}
                aria-label={`Nota ${midiToNoteName(note.midi)}, início ${note.startTime}s, duração ${note.duration}s`}
                data-testid={`note-block-${note.id}`}
                style={{
                  position: "absolute",
                  left: `${leftPercent}%`,
                  width: `${widthPercent}%`,
                  top: "20px",
                  height: "50px",
                  background: isSelected ? "var(--accent)" : "linear-gradient(180deg, #2b2622 0%, #1f1b17 100%)",
                  color: isSelected ? "#000" : "var(--text)",
                  border: isSelected ? "2px solid #fff" : "1px solid var(--line)",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  padding: "0 4px",
                  boxShadow: isSelected ? "0 0 12px rgba(245,158,11,0.8)" : "var(--neu-button)",
                  transition: "all 0.12s ease",
                }}
              >
                {midiToNoteName(note.midi)}
              </button>
            );
          })}
        </div>

        {/* Note Inspector */}
        {selectedNote && (
          <div
            className="note-inspector retro-card"
            style={{
              marginTop: "14px",
            }}
            data-testid="note-inspector"
          >
            <h3 style={{ margin: "0 0 8px" }}>
              EDITAR NOTA: {midiToNoteName(selectedNote.midi)} ({selectedNote.pitch.toFixed(1)} Hz)
            </h3>
            <div className="controls">
              <button className="ghost" onClick={() => handleChangePitch(1)}>
                TOM +1 ST
              </button>
              <button className="ghost" onClick={() => handleChangePitch(-1)}>
                TOM -1 ST
              </button>
              <button className="ghost" onClick={() => handleMoveNote(-0.25)}>
                ◄ INÍCIO -0.25s
              </button>
              <button className="ghost" onClick={() => handleMoveNote(0.25)}>
                ► INÍCIO +0.25s
              </button>
              <button className="ghost" onClick={() => handleChangeDuration(-0.1)}>
                CURTAR -0.1s
              </button>
              <button className="ghost" onClick={() => handleChangeDuration(0.1)}>
                ESTICAR +0.1s
              </button>
              <button className="ghost stop" onClick={handleDeleteSelectedNote} data-testid="btn-delete-note">
                <TrashIcon size={14} /> EXCLUIR NOTA
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Chord Progression Track */}
      <section className="panel" aria-label="Trilha Harmônica">
        <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>PROGRESSÃO DE ACORDES ({composition.chords.length} COMPASSOS)</h2>
          <button className="primary" onClick={handleRegenerateChords} data-testid="btn-regen-chords">
            <LightningIcon size={14} /> REGENERAR ACOMPANHAMENTO
          </button>
        </div>

        <div className="controls" style={{ marginTop: "12px", overflowX: "auto" }}>
          {composition.chords.map((ch, idx) => (
            <div
              key={ch.id}
              className="chord-box retro-card"
              style={{
                padding: "8px 12px",
                minWidth: "120px",
              }}
            >
              <span className="hint">Compasso {ch.startBar + 1}</span>
              <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                <select
                  value={ch.chord.root}
                  onChange={(e) => handleChordChange(idx, { root: parseInt(e.target.value, 10) as any })}
                  aria-label={`Fundamental do compasso ${ch.startBar + 1}`}
                >
                  {PITCH_CLASSES.map((pc, r) => (
                    <option key={pc} value={r}>
                      {pc}
                    </option>
                  ))}
                </select>
                <select
                  value={ch.chord.quality}
                  onChange={(e) => handleChordChange(idx, { quality: e.target.value as ChordQuality })}
                  aria-label={`Qualidade do compasso ${ch.startBar + 1}`}
                >
                  {QUALITIES.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Mixer & Instrumentation */}
      <section className="panel" aria-label="Mixer de Instrumentos">
        <h2>MIXER DE INSTRUMENTOS</h2>
        <div className="band-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px", marginTop: "12px" }}>
          {INSTRUMENTS.map((inst) => {
            const ch = composition.instruments[inst] ?? { volume: 0.9, pan: 0, muted: false };
            return (
              <div
                key={inst}
                className="channel-strip retro-card"
                style={{
                  padding: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: "12px", letterSpacing: "0.1em", color: "#f59e0b" }}>{inst.toUpperCase()}</strong>
                  <button
                    className={`ghost ${ch.muted ? "stop" : ""}`}
                    onClick={() => onChange(toggleInstrumentMute(composition, inst))}
                    aria-label={`Mute ${inst}`}
                    style={{ padding: "2px 6px", fontSize: "10px", minHeight: "26px" }}
                  >
                    {ch.muted ? "MUTED" : "MUTE"}
                  </button>
                </div>
                <div style={{ marginTop: "8px" }}>
                  <label className="hint" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>VOL</span>
                    <span>{Math.round(ch.volume * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={ch.volume}
                    onChange={(e) =>
                      onChange(setInstrumentControl(composition, inst, { volume: parseFloat(e.target.value) }))
                    }
                    style={{ width: "100%" }}
                    aria-label={`Volume de ${inst}`}
                  />
                </div>
                <div style={{ marginTop: "4px" }}>
                  <label className="hint" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>PAN</span>
                    <span>{ch.pan < 0 ? `L${Math.round(-ch.pan * 100)}` : ch.pan > 0 ? `R${Math.round(ch.pan * 100)}` : "C"}</span>
                  </label>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.1}
                    value={ch.pan}
                    onChange={(e) =>
                      onChange(setInstrumentControl(composition, inst, { pan: parseFloat(e.target.value) }))
                    }
                    style={{ width: "100%" }}
                    aria-label={`Pan de ${inst}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
