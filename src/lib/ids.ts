/** Pico id generator (no deps). Format: prefix_epoch_rand36 */
export function newId(prefix = "ev"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
