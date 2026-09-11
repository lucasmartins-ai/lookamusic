"use client";

/**
 * HelpDialog — shortcuts + minimal glossary (Phase 10). Non-modal overlay
 * panel: initial focus on close, Esc/backdrop closes, Tab cycles inside,
 * focus returns to the opener (parent owns the opener ref).
 */
import { useEffect, useRef } from "react";
import { GLOSSARY, SHORTCUTS, type ShortcutScope } from "./helpContent";

interface HelpDialogProps {
  scope: ShortcutScope;
  onClose: () => void;
}

export function HelpDialog({ scope, onClose }: HelpDialogProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const rows = SHORTCUTS.filter((s) => s.scope === "global" || s.scope === scope);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !rootRef.current) return;
      const items = rootRef.current.querySelectorAll<HTMLElement>(
        'button, [href], select, input, [tabindex]:not([tabindex="-1"])',
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="help-backdrop" onClick={onClose} data-testid="help-backdrop">
      <div
        ref={rootRef}
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Ajuda e atalhos"
        data-testid="help-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 tabIndex={-1}>AJUDA E ATALHOS</h2>
        <h3>Teclado</h3>
        <dl className="keys">
          {rows.map((r) => (
            <div key={`${r.scope}-${r.keys}-${r.action}`}>
              <dt>
                <kbd>{r.keys}</kbd>
              </dt>
              <dd>{r.action}</dd>
            </div>
          ))}
        </dl>
        <h3>Glossário mínimo</h3>
        <dl className="glossary">
          {GLOSSARY.map((g) => (
            <div key={g.term}>
              <dt>{g.term}</dt>
              <dd>{g.definition}</dd>
            </div>
          ))}
        </dl>
        <div className="controls">
          <button ref={closeRef} className="primary" onClick={onClose} data-testid="help-close">
            FECHAR (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
