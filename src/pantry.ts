// PantryPilot — data model, photo handling, and persistence.
//
// Persistence is two-tier:
//   1. Firebase (anonymous auth + Firestore) when a real config is present.
//   2. localStorage when there is no config yet (demo mode) or Firestore fails.
// The UI never has to know which tier is active.

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";

export interface PantryItem {
  id: string;
  name: string;
  quantity: string;
  confidence?: number;
}

export interface Recipe {
  title: string;
  minutes: number;
  difficulty: "easy" | "medium" | "hard";
  uses: string[];
  missing: string[];
  steps: string[];
}

export interface DayPlan {
  day: string;
  breakfast: string;
  lunch: string;
  dinner: string;
}

export interface WeeklyPlan {
  days: DayPlan[];
  nutrition: {
    caloriesPerDay: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    note: string;
  };
  shopping: string[];
}

export interface HistoryEntry {
  id: string;
  when: number;
  items: PantryItem[];
  photoName: string;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Add an item, merging with an existing one of the same name (case-insensitive)
 *  instead of creating a duplicate chip. Returns the new list. */
export function addOrMergeItem(items: PantryItem[], name: string, quantity: string): PantryItem[] {
  const existing = items.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (!existing) return [...items, { id: newId(), name, quantity }];
  if (quantity && existing.quantity && existing.quantity !== quantity) {
    existing.quantity = `${existing.quantity} + ${quantity}`;
  } else if (quantity && !existing.quantity) {
    existing.quantity = quantity;
  }
  return [...items];
}

/** Turn an uploaded photo into the inline-data part Gemini expects.
 *  Large photos are downscaled to at most 1024 px on the long side first —
 *  Gemini Nano's image input is small, and it keeps the request light. */
export async function photoFileToInlineData(
  file: File,
): Promise<{ data: string; mimeType: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const mimeType = "image/jpeg";
  const dataUrl = canvas.toDataURL(mimeType, 0.85);
  const data = dataUrl.split(",")[1] ?? "";
  return { data, mimeType, dataUrl };
}

// ---------------------------------------------------------------------------
// Persistence (Firestore when available, localStorage otherwise)
// ---------------------------------------------------------------------------

const LS_ITEMS = "pantrypilot.items.v1";
const LS_PLAN = "pantrypilot.plan.v1";
const LS_HISTORY = "pantrypilot.history.v1";
const LS_SHOPPING = "pantrypilot.shopping.v1";

function lsRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private mode) — the in-memory state still works.
  }
}

export interface Store {
  saveItems(items: PantryItem[]): Promise<void>;
  loadItems(): Promise<PantryItem[]>;
  savePlan(plan: WeeklyPlan | null): Promise<void>;
  loadPlan(): Promise<WeeklyPlan | null>;
  saveShopping(names: string[]): Promise<void>;
  loadShopping(): Promise<string[]>;
  addHistory(entry: HistoryEntry): Promise<void>;
  loadHistory(): Promise<HistoryEntry[]>;
}

/** Local-only store. Used in demo mode and as the fallback if Firestore fails. */
export function localStore(): Store {
  return {
    async saveItems(items) {
      lsWrite(LS_ITEMS, items);
    },
    async loadItems() {
      return lsRead<PantryItem[]>(LS_ITEMS, []);
    },
    async savePlan(plan) {
      lsWrite(LS_PLAN, plan);
    },
    async loadPlan() {
      return lsRead<WeeklyPlan | null>(LS_PLAN, null);
    },
    async saveShopping(names) {
      lsWrite(LS_SHOPPING, names);
    },
    async loadShopping() {
      return lsRead<string[]>(LS_SHOPPING, []);
    },
    async addHistory(entry) {
      const all = lsRead<HistoryEntry[]>(LS_HISTORY, []);
      all.unshift(entry);
      lsWrite(LS_HISTORY, all.slice(0, 20));
    },
    async loadHistory() {
      return lsRead<HistoryEntry[]>(LS_HISTORY, []);
    },
  };
}

/** Firestore-backed store, one document per user under `users/{uid}/state`. */
export function firestoreStore(deps: { db: Firestore; uid: string }): Store {
  const { db, uid } = deps;
  const local = localStore();
  const stateRef = (name: string) => doc(db, "users", uid, "state", name);
  return {
    async saveItems(items) {
      try {
        await setDoc(stateRef("pantry"), { items, updatedAt: serverTimestamp() });
      } catch {
        await local.saveItems(items);
      }
    },
    async loadItems() {
      try {
        const snap = await getDoc(stateRef("pantry"));
        const data = snap.data() as { items?: PantryItem[] } | undefined;
        return data?.items ?? (await local.loadItems());
      } catch {
        return local.loadItems();
      }
    },
    async savePlan(plan) {
      try {
        await setDoc(stateRef("plan"), { plan, updatedAt: serverTimestamp() });
      } catch {
        await local.savePlan(plan);
      }
    },
    async loadPlan() {
      try {
        const snap = await getDoc(stateRef("plan"));
        const data = snap.data() as { plan?: WeeklyPlan | null } | undefined;
        return data?.plan ?? (await local.loadPlan());
      } catch {
        return local.loadPlan();
      }
    },
    async saveShopping(names) {
      try {
        await setDoc(stateRef("shopping"), { names, updatedAt: serverTimestamp() });
      } catch {
        await local.saveShopping(names);
      }
    },
    async loadShopping() {
      try {
        const snap = await getDoc(stateRef("shopping"));
        const data = snap.data() as { names?: string[] } | undefined;
        return data?.names ?? (await local.loadShopping());
      } catch {
        return local.loadShopping();
      }
    },
    async addHistory(entry) {
      try {
        await addDoc(collection(db, "users", uid, "history"), {
          ...entry,
          createdAt: serverTimestamp(),
        });
      } catch {
        await local.addHistory(entry);
      }
    },
    async loadHistory() {
      try {
        const q = query(
          collection(db, "users", uid, "history"),
          orderBy("createdAt", "desc"),
          limit(20),
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => d.data() as HistoryEntry);
      } catch {
        return local.loadHistory();
      }
    },
  };
}
