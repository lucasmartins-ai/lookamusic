/** Minimal typed event bus (§33). Ring-buffer trace in dev (cap 500). */
import type { DomainEvents, DomainEventName } from "@/domain/events";

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<never>>>();
  readonly trace: { name: string; at: number }[] = [];

  on<K extends DomainEventName>(name: K, fn: Handler<DomainEvents[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  emit<K extends DomainEventName>(name: K, payload: DomainEvents[K]): void {
    if (process.env.NODE_ENV !== "production") {
      this.trace.push({ name, at: Date.now() });
      if (this.trace.length > 500) this.trace.shift();
    }
    this.handlers.get(name)?.forEach((fn) => (fn as Handler<DomainEvents[K]>)(payload));
  }
}

export const bus = new EventBus();
