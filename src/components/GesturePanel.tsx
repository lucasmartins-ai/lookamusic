/**
 * GesturePanel — camera + gesture controls (Phase 9). Renders only:
 * pre-explain card, preview, denial-recovery card, gesture + confidence
 * indicator, parity buttons + selection target. Business logic lives in
 * `features/gestures/useGestures.ts`; arrangement effects live in the
 * conductor (`GestureDetected` → arrangement). This component never
 * touches engines, landmarks, or synthesis.
 */
import { INSTRUMENTS, type GestureKind, type InstrumentId } from "@/domain/types";
import type { GesturesApi } from "@/features/gestures/useGestures";
import { GESTURE_CONTROLS, GESTURE_KEYBOARD, GESTURE_ORDER } from "@/features/gestures/mapping";

const INSTRUMENT_LABELS: Record<InstrumentId, string> = {
  drums: "Bateria",
  bass: "Baixo",
  piano: "Piano",
  guitar: "Violão",
  strings: "Cordas",
  violin: "Violino",
  sax: "Sax",
  accordion: "Acordeão",
};

const GESTURE_NAMES: Record<GestureKind, string> = {
  OPEN_HAND: "Mão aberta",
  CLOSED_HAND: "Mão fechada",
  ONE_FINGER: "1 dedo",
  TWO_FINGERS: "2 dedos",
  THREE_FINGERS: "3 dedos",
  SWIPE_UP: "Deslizar ↑",
  SWIPE_DOWN: "Deslizar ↓",
  SWIPE_LEFT: "Deslizar ←",
  SWIPE_RIGHT: "Deslizar →",
};

interface GesturePanelProps {
  gestures: GesturesApi;
  /** Instrument the open/close gestures act on (conductor-owned). */
  selected: InstrumentId;
  onSelect: (id: InstrumentId) => void;
}

export function GesturePanel({ gestures, selected, onSelect }: GesturePanelProps) {
  const {
    videoRef,
    camera,
    cameraError,
    acknowledged,
    visionReady,
    lastGesture,
    liveKind,
    liveProgress01,
    liveConfidence,
  } = gestures;

  const running = camera === "running";
  const preview = running || camera === "requesting";
  const visionBadge = !running ? "OFF" : visionReady ? "VISION" : "PREVIEW";
  const lastPct = lastGesture ? Math.round(lastGesture.confidence * 100) : 0;
  const showExplain = !acknowledged && camera === "idle" && cameraError === null;

  return (
    <div>
      <div className="controls">
        <span
          className="pill"
          role="status"
          aria-label={`Visão computacional ${visionBadge}`}
          data-testid="gesture-vision-badge"
        >
          👁 {visionBadge}
        </span>
        <div className="control-field">
          <label htmlFor="gesture-selected">ALVO</label>
          <select
            id="gesture-selected"
            value={selected}
            onChange={(e) => onSelect(e.target.value as InstrumentId)}
            aria-label="Instrumento alvo dos gestos de mão"
            data-testid="gesture-selected"
          >
            {(INSTRUMENTS as readonly InstrumentId[]).map((id) => (
              <option key={id} value={id}>
                {INSTRUMENT_LABELS[id]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Preview element stays mounted so the hook can attach anytime. */}
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Pré-visualização da câmera para regência por gestos"
        data-testid="gesture-video"
        style={preview ? { width: "100%", maxWidth: 320, borderRadius: 8 } : { display: "none" }}
      />

      {showExplain && (
        <div className="notice" role="note" data-testid="gesture-explain">
          <strong>Reja com as mãos (opcional).</strong>
          <br />
          A câmera classifica gestos no próprio dispositivo — os frames nunca saem daqui e nunca
          são gravados. Sem câmera, todos os gestos funcionam por botão e teclado.
          <div className="controls">
            <button
              className="primary"
              onClick={gestures.startCamera}
              aria-label="Ativar câmera para gestos"
              data-testid="gesture-start"
            >
              📷 ATIVAR CÂMERA
            </button>
            <button className="ghost" onClick={gestures.acknowledge} data-testid="gesture-dismiss">
              Continuar sem câmera
            </button>
          </div>
        </div>
      )}

      {!showExplain && !running && cameraError === null && (
        <div className="controls">
          <button onClick={gestures.startCamera} aria-label="Ativar câmera para gestos">
            📷 Ativar câmera
          </button>
        </div>
      )}

      {cameraError && (
        <div className="notice error" role="alert" data-testid="gesture-error">
          <strong>{cameraError.message}</strong>
          <br />
          {cameraError.recovery}
          <div className="controls">
            <button className="primary" onClick={gestures.startCamera} data-testid="gesture-retry">
              TENTAR NOVAMENTE
            </button>
            <button className="ghost" onClick={gestures.stopCamera}>
              Continuar sem câmera
            </button>
          </div>
        </div>
      )}

      {running && (
        <div className="controls">
          <button onClick={gestures.stopCamera} aria-label="Desligar câmera">
            ■ Desligar câmera{visionReady ? "" : " (pré-visualização — modelo carregando…)"}
          </button>
        </div>
      )}

      <div
        className="control-field"
        role="meter"
        aria-label={
          lastGesture
            ? `Último gesto ${GESTURE_NAMES[lastGesture.kind]} confiança ${lastPct}%`
            : "Nenhum gesto detectado ainda"
        }
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={lastPct}
        data-testid="gesture-indicator"
      >
        <label aria-live="polite">
          {liveKind
            ? `Segurando ${GESTURE_NAMES[liveKind]}… ${Math.round(liveProgress01 * 100)}% (conf ${Math.round(liveConfidence * 100)}%)`
            : lastGesture
              ? `Último gesto: ${GESTURE_NAMES[lastGesture.kind]} · ${lastPct}% · alvo ${INSTRUMENT_LABELS[selected]}`
              : "Nenhum gesto ainda — segure uma pose 0,4 s ou use os botões"}
        </label>
        <div className="energy-bar" aria-hidden>
          <div
            className="energy-fill"
            style={{ width: `${liveKind ? Math.round(liveProgress01 * 100) : lastPct}%` }}
          />
        </div>
      </div>

      <div className="band-grid" role="group" aria-label="Ações de regência (equivalentes aos gestos)">
        {GESTURE_ORDER.map((kind) => (
          <button
            key={kind}
            onClick={() => gestures.send(kind)}
            title={`${GESTURE_CONTROLS[kind].hint} — tecla ${GESTURE_KEYBOARD[kind]}`}
            aria-label={`${GESTURE_CONTROLS[kind].label} (gesto: ${GESTURE_NAMES[kind]}, tecla ${GESTURE_KEYBOARD[kind]})`}
            data-testid={`gesture-btn-${kind}`}
          >
            {GESTURE_CONTROLS[kind].label}{" "}
            <kbd aria-hidden>{GESTURE_KEYBOARD[kind].replace("Arrow", "")}</kbd>
          </button>
        ))}
      </div>

      <p className="hint" role="note">
        Teclado: O adicionar · C remover · 1/2/3 energia · setas energia/seleção. Gestos por câmera
        exigem pose estável (~0,4 s) + intervalo de 1,2 s — sem disparos duplos.
      </p>
    </div>
  );
}
