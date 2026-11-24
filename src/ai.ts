// PantryPilot — Firebase AI Logic integration.
//
// This is the only file that talks to Firebase. The hybrid split lives here:
//   - items + recipes:  PREFER_ON_DEVICE (Gemini Nano when available, cloud fallback)
//   - weekly plan:      ONLY_IN_CLOUD   (long context, heavier reasoning)
//
// Every AI call returns `{ data, source, latencyMs }`, where `source` is read
// from `result.response.inferenceSource` ("on_device" | "in_cloud") — the SDK
// tells us which path actually ran, and the UI badges it. In demo mode
// (no Firebase config yet) the calls go to the clearly-marked mock in
// src/mock.ts and the source is "demo".

import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import {
  CustomProvider,
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
} from "firebase/app-check";
import {
  GoogleAIBackend,
  InferenceMode,
  getAI,
  getGenerativeModel,
  type GenerativeModel,
} from "firebase/ai";

import { appCheckSiteKey, firebaseConfig, isFirebaseConfigured } from "./firebase-config";
import { ITEMS_PROMPT, itemsSchema, planPrompt, planSchema, recipesPrompt, recipesSchema } from "./recipes";
import { mockBuildPlan, mockIdentifyItems, mockSuggestRecipes } from "./mock";
import type { PantryItem, Recipe, WeeklyPlan } from "./pantry";

export type InferenceSource = "on_device" | "in_cloud" | "demo" | "unknown";

export interface AiResult<T> {
  data: T;
  source: InferenceSource;
  latencyMs: number;
}

/** True when the app runs against a real Firebase project. */
export const aiEnabled = isFirebaseConfigured;

/** True when the app runs in demo mode (mock AI, localStorage persistence). */
export const isDemoMode = !isFirebaseConfigured;

const CLOUD_MODEL = "gemini-3.5-flash-lite"; // SDK 13 default cloud model

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let itemsModel: GenerativeModel | null = null;
let recipesModel: GenerativeModel | null = null;
let planModel: GenerativeModel | null = null;
let deviceInitAttempted = false;

export function getAuthInstance(): Auth | null {
  return auth;
}

export function getDbInstance(): Firestore | null {
  return db;
}

/** Initialize Firebase (no-op in demo mode). Call once at startup. */
export function initFirebase(): void {
  if (!isFirebaseConfigured || app) return;
  app = initializeApp(firebaseConfig);

  // App Check is enforced for AI Logic. Local dev uses the debug provider:
  // setting the flag makes the SDK print a debug token to the console, which
  // the owner registers once in Console > Security > App Check > Manage
  // debug tokens. Debug tokens are explicitly accepted by the hackathon.
  if (import.meta.env.DEV) {
    (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  if (appCheckSiteKey) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey) });
  } else {
    // No reCAPTCHA key configured. In dev this runs on the debug provider
    // above; in production the provider throws a clear error instead of
    // silently letting calls fail.
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          throw new Error(
            "App Check is not configured: set appCheckSiteKey in src/firebase-config.ts, " +
              "or run on localhost with the App Check debug provider (see README.md).",
          );
        },
      }),
    });
  }

  auth = getAuth(app);
  db = getFirestore(app);
}

/** Sign in anonymously so pantry history can be saved per user. */
export async function ensureAnonymousUser(): Promise<string | null> {
  if (!auth) return null;
  try {
    if (auth.currentUser) return auth.currentUser.uid;
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch (err) {
    console.warn("Anonymous sign-in failed, using local storage only.", err);
    return null;
  }
}

function hybridModel(schema: typeof itemsSchema): GenerativeModel {
  const ai = getAI(app!, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: { responseMimeType: "application/json", responseSchema: schema },
    },
    onDeviceParams: { promptOptions: { responseConstraint: schema } },
  });
}

function cloudModel(schema: typeof planSchema): GenerativeModel {
  const ai = getAI(app!, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: { responseMimeType: "application/json", responseSchema: schema },
    },
  });
}

/**
 * Initialize the on-device model. MUST be called on (or after) a user
 * gesture — e.g. the button click that starts the first AI call — and before
 * the first prompt. Reports download progress (0..1) so the UI can show a
 * progress bar while Gemini Nano downloads on first use. Resolves false
 * when on-device is unavailable; the hybrid models then fall back to cloud.
 */
export async function ensureDeviceModel(
  onProgress?: (progress: number) => void,
): Promise<boolean> {
  if (!aiEnabled || !itemsModel) return false;
  if (deviceInitAttempted) return true;
  deviceInitAttempted = true;
  try {
    await itemsModel.initializeDeviceModel(onProgress);
    return true;
  } catch (err) {
    console.warn("On-device model unavailable; cloud fallback will be used.", err);
    return false;
  }
}

function sourceOf(result: { response?: { inferenceSource?: string } }): InferenceSource {
  const s = result.response?.inferenceSource;
  if (s === "on_device") return "on_device";
  if (s === "in_cloud") return "in_cloud";
  return "unknown";
}

/** Parse model JSON, tolerating markdown fences around the payload. */
function parseJson<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("The model did not return valid JSON.");
  }
}

// ---------------------------------------------------------------------------
// Feature 1 — photo -> items (ON-DEVICE first)
// ---------------------------------------------------------------------------

export async function identifyItems(
  photo: { data: string; mimeType: string },
  onDeviceProgress?: (progress: number) => void,
): Promise<AiResult<PantryItem[]>> {
  const started = performance.now();
  if (!aiEnabled) {
    const items = await mockIdentifyItems();
    return { data: items, source: "demo", latencyMs: Math.round(performance.now() - started) };
  }
  if (!itemsModel) itemsModel = hybridModel(itemsSchema);
  await ensureDeviceModel(onDeviceProgress);
  const result = await itemsModel.generateContent([
    ITEMS_PROMPT,
    { type: "inlineData", inlineData: { data: photo.data, mimeType: photo.mimeType } },
  ]);
  const parsed = parseJson<{ items: Array<{ name: string; quantity?: string; confidence?: number }> }>(
    result.response.text(),
  );
  const items: PantryItem[] = (parsed.items ?? []).map((it, i) => ({
    id: `ai-${Date.now().toString(36)}-${i}`,
    name: it.name.trim(),
    quantity: (it.quantity ?? "").trim(),
    confidence: typeof it.confidence === "number" ? it.confidence : undefined,
  }));
  return { data: items, source: sourceOf(result), latencyMs: Math.round(performance.now() - started) };
}

// ---------------------------------------------------------------------------
// Feature 2 — "What can I cook?" (ON-DEVICE first)
// ---------------------------------------------------------------------------

export async function suggestRecipes(
  items: PantryItem[],
  opts: { diet: string; allergies: string; servings: number },
  onDeviceProgress?: (progress: number) => void,
): Promise<AiResult<Recipe[]>> {
  const started = performance.now();
  if (!aiEnabled) {
    const recipes = await mockSuggestRecipes(items);
    return { data: recipes, source: "demo", latencyMs: Math.round(performance.now() - started) };
  }
  if (!recipesModel) recipesModel = hybridModel(recipesSchema);
  await ensureDeviceModel(onDeviceProgress);
  const prompt = recipesPrompt(
    items.map((i) => i.name),
    opts,
  );
  const result = await recipesModel.generateContent(prompt);
  const parsed = parseJson<{ recipes: Recipe[] }>(result.response.text());
  return {
    data: (parsed.recipes ?? []).slice(0, 3),
    source: sourceOf(result),
    latencyMs: Math.round(performance.now() - started),
  };
}

// ---------------------------------------------------------------------------
// Feature 3 — weekly plan + nutrition (CLOUD only)
// ---------------------------------------------------------------------------

export async function buildWeeklyPlan(
  items: PantryItem[],
  opts: { diet: string; allergies: string; household: number },
): Promise<AiResult<WeeklyPlan>> {
  const started = performance.now();
  if (!aiEnabled) {
    const plan = await mockBuildPlan(items);
    return { data: plan, source: "demo", latencyMs: Math.round(performance.now() - started) };
  }
  if (!planModel) planModel = cloudModel(planSchema);
  const prompt = planPrompt(
    items.map((i) => i.name),
    opts,
  );
  const result = await planModel.generateContent(prompt);
  const parsed = parseJson<WeeklyPlan>(result.response.text());
  return { data: parsed, source: sourceOf(result), latencyMs: Math.round(performance.now() - started) };
}
