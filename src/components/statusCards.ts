/**
 * Mic status → user-facing card (Phase 10, §43). Every non-running session
 * state maps to a card with title + recovery — never a silent broken
 * screen. Falls back to built-in copy when `SessionError` is absent.
 * Pure data; `StatusCard.tsx` only renders.
 */
import type { SessionError, SessionStatus } from "@/features/audio/session";

export type StatusTone = "info" | "loading" | "error" | "warning";

export interface StatusCardAction {
  label: string;
  kind: "retry" | "help";
}

export interface StatusCardContent {
  tone: StatusTone;
  title: string;
  body: string;
  actions: StatusCardAction[];
  testId: string;
}

const RETRY: StatusCardAction = { label: "Tentar novamente", kind: "retry" };
const HELP: StatusCardAction = { label: "Abrir ajuda", kind: "help" };

const FALLBACK: Record<string, { title: string; body: string }> = {
  denied: {
    title: "Microfone bloqueado",
    body: "A permissão foi negada. Libere o microfone no ícone da barra de endereço e tente de novo.",
  },
  "no-mic": {
    title: "Nenhum microfone encontrado",
    body: "Conecte um microfone e confira a entrada de áudio do sistema.",
  },
  suspended: {
    title: "Áudio pausado pelo navegador",
    body: "O navegador suspendeu a saída de áudio. Toque em Tentar novamente — o áudio precisa retomar a partir de um gesto seu.",
  },
  unsupported: {
    title: "Navegador sem suporte",
    body: "Este navegador não oferece microfone ou AudioWorklets. Use um Chrome, Edge, Safari ou Firefox recente no desktop.",
  },
  error: {
    title: "Não foi possível abrir o microfone",
    body: "Feche outros apps que usam o microfone e tente de novo.",
  },
};

export function micStatusCard(
  status: SessionStatus,
  error: SessionError | null,
): StatusCardContent | null {
  if (status === "running") return null;
  if (status === "requesting") {
    return {
      tone: "loading",
      title: "Pedindo acesso ao microfone…",
      body: "Confirme a permissão no diálogo do navegador. Nada é gravado ou enviado — o áudio fica neste dispositivo.",
      actions: [],
      testId: "status-requesting",
    };
  }
  if (status === "idle") {
    return {
      tone: "info",
      title: "Sua voz é o primeiro instrumento",
      body: "O LookaMusic ouve localmente no navegador — o áudio do microfone nunca sai deste dispositivo. Aperte START e cante uma nota sustentada.",
      actions: [{ label: "Como funciona", kind: "help" }],
      testId: "status-idle",
    };
  }
  const fb = FALLBACK[status] ?? FALLBACK.error;
  return {
    tone: "error",
    title: error?.message ?? fb.title,
    body: error?.recovery ?? fb.body,
    actions: status === "unsupported" ? [HELP] : [RETRY, HELP],
    testId: `status-${status}`,
  };
}
