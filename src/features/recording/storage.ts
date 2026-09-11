/**
 * IndexedDB persistence for compositions (Phase 11, §41, TDR-06).
 * Local-first storage: no backend required.
 * Falls back to an in-memory store in environments without IndexedDB (e.g. Node.js unit tests, SSR).
 */
import { config } from "@/lib/config";
import type { Composition } from "@/domain/types";
import { validateComposition } from "./schema";

export interface CompositionSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tempo: number;
  styleId: string;
  noteCount: number;
  chordCount: number;
}

// Memory fallback store for non-browser environments (Node.js, Vitest, SSR)
const memoryStore = new Map<string, Composition>();

function hasIndexedDB(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = window.indexedDB.open(
      config.recording.dbName,
      config.recording.dbVersion,
    );

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(config.recording.storeName)) {
        db.createObjectStore(config.recording.storeName, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function saveComposition(comp: Composition): Promise<void> {
  // Validate schema strictly before persisting
  const validated = validateComposition(comp);

  if (!hasIndexedDB()) {
    memoryStore.set(validated.id, JSON.parse(JSON.stringify(validated)));
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(config.recording.storeName, "readwrite");
    const store = tx.objectStore(config.recording.storeName);
    const req = store.put(validated);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to save composition"));
    tx.oncomplete = () => db.close();
  });
}

export async function loadComposition(id: string): Promise<Composition | null> {
  if (!hasIndexedDB()) {
    const found = memoryStore.get(id);
    return found ? validateComposition(JSON.parse(JSON.stringify(found))) : null;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(config.recording.storeName, "readonly");
    const store = tx.objectStore(config.recording.storeName);
    const req = store.get(id);

    req.onsuccess = () => {
      if (!req.result) {
        resolve(null);
      } else {
        try {
          resolve(validateComposition(req.result));
        } catch (err) {
          reject(err);
        }
      }
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to load composition"));
    tx.oncomplete = () => db.close();
  });
}

export async function listCompositions(): Promise<CompositionSummary[]> {
  if (!hasIndexedDB()) {
    return Array.from(memoryStore.values()).map((c) => ({
      id: c.id,
      name: c.name,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      tempo: c.tempo,
      styleId: c.styleId,
      noteCount: c.melody.length,
      chordCount: c.chords.length,
    }));
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(config.recording.storeName, "readonly");
    const store = tx.objectStore(config.recording.storeName);
    const req = store.getAll();

    req.onsuccess = () => {
      const all = (req.result as Composition[]) || [];
      const summaries: CompositionSummary[] = all.map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        tempo: c.tempo,
        styleId: c.styleId,
        noteCount: Array.isArray(c.melody) ? c.melody.length : 0,
        chordCount: Array.isArray(c.chords) ? c.chords.length : 0,
      }));
      resolve(summaries);
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to list compositions"));
    tx.oncomplete = () => db.close();
  });
}

export async function deleteComposition(id: string): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStore.delete(id);
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(config.recording.storeName, "readwrite");
    const store = tx.objectStore(config.recording.storeName);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to delete composition"));
    tx.oncomplete = () => db.close();
  });
}

export async function clearAllCompositions(): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStore.clear();
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(config.recording.storeName, "readwrite");
    const store = tx.objectStore(config.recording.storeName);
    const req = store.clear();

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to clear compositions"));
    tx.oncomplete = () => db.close();
  });
}
