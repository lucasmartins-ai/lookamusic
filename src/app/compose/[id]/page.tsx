/**
 * `/compose/[id]` — thin web wrapper over ComposeEditor.
 * The desktop (static export) build reaches the editor via
 * `/compose/editor?id=` instead (dynamic params can't pre-render).
 */
import { ComposeByIdClient } from "./client";

export function generateStaticParams(): { id: string }[] {
  // `output: export` requires ≥1 pre-rendered param; the real ids live in
  // IndexedDB at runtime (web serves them dynamically, desktop uses
  // `/compose/editor?id=`). This placeholder is never linked to.
  return [{ id: "index" }];
}

export default function ComposeByIdPage() {
  return <ComposeByIdClient />;
}
