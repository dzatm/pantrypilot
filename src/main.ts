// PantryPilot — UI shell, state, and wiring.
//
// Single-page flow:
//   1. Snap a pantry photo        -> items (ON-DEVICE first)
//   2. Edit the items, set prefs  -> "What can I cook?" (ON-DEVICE first)
//   3. "Build my week"            -> 7-day plan + nutrition (CLOUD)
//   4. Shopping list from the plan, saved per user (anonymous auth + Firestore,
//      localStorage when there is no Firebase project yet).
//
// State lives in memory and is persisted through the Store in src/pantry.ts.
// Rendering is done by re-rendering the dynamic regions; all clicks are
// handled by one delegated listener on #app so re-renders never lose handlers.

import "./style.css";
import {
  aiEnabled,
  buildWeeklyPlan,
  ensureAnonymousUser,
  getDbInstance,
  identifyItems,
  initFirebase,
  suggestRecipes,
  type InferenceSource,
} from "./ai";
import { isFirebaseConfigured } from "./firebase-config";
import {
  addOrMergeItem,
  firestoreStore,
  localStore,
  newId,
  photoFileToInlineData,
  type HistoryEntry,
  type PantryItem,
  type Recipe,
  type Store,
  type WeeklyPlan,
} from "./pantry";
import { badge, hybridExplainer } from "./ui/badge";
import { addItemFormHtml, chipsHtml } from "./ui/chips";
import { planHtml, recipeCardsHtml, shoppingListHtml } from "./ui/cards";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface Photo {
  data: string;
  mimeType: string;
  dataUrl: string;
  name: string;
}

interface State {
  photo: Photo | null;
  items: PantryItem[];
  recipes: Recipe[] | null;
  recipesSource: InferenceSource | null;
  recipesLatency: number | null;
  plan: WeeklyPlan | null;
  planSource: InferenceSource | null;
  planLatency: number | null;
  shopping: string[];
  shoppingChecked: Set<string>;
  itemsSource: InferenceSource | null;
  itemsLatency: number | null;
  diet: string;
  allergies: string;
  servings: number;
  household: number;
  busy: string | null;
  busyNote: string;
  deviceProgress: number | null;
  error: string | null;
  history: HistoryEntry[];
}

const state: State = {
  photo: null,
  items: [],
  recipes: null,
  recipesSource: null,
  recipesLatency: null,
  plan: null,
  planSource: null,
  planLatency: null,
  shopping: [],
  shoppingChecked: new Set(),
  itemsSource: null,
  itemsLatency: null,
  diet: "",
  allergies: "",
  servings: 2,
  household: 2,
  busy: null,
  busyNote: "",
  deviceProgress: null,
  error: null,
  history: [],
};

let store: Store = localStore();

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const appEl = document.querySelector<HTMLDivElement>("#app")!;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function statusPill(): string {
  if (!isFirebaseConfigured) {
    return `<span class="pill pill-demo">Demo mode · mock AI — connect Firebase for real on-device / cloud AI</span>`;
  }
  return `<span class="pill pill-live">Firebase connected · hybrid AI on</span>`;
}

function setupBanner(): string {
  if (isFirebaseConfigured) return "";
  return `
    <section class="banner" role="note">
      <strong>Setup needed for real AI.</strong>
      This copy runs in demo mode: the full flow works with a clearly-marked
      mock, so you can try everything end to end. To enable real Gemini Nano
      (on-device) + Gemini (cloud), create a Firebase project, enable AI Logic
      with the Gemini Developer API, and paste the config into
      <code>src/firebase-config.ts</code> — full steps in <code>README.md</code>.
    </section>`;
}

function photoSection(): string {
  const p = state.photo;
  return `
    <section class="card" id="step-photo">
      <h2><span class="step-num">1</span> Snap your pantry</h2>
      <p class="muted">A photo of a fridge shelf, a pantry, or a shopping bag — whatever you have on hand.</p>
      <div class="photo-row">
        <label class="btn btn-primary file-btn">
          📷 Choose a photo
          <input id="photo-input" type="file" accept="image/*" hidden />
        </label>
        ${p ? `<button type="button" class="btn btn-ghost" data-action="clear-photo">Remove photo</button>` : ""}
      </div>
      ${p ? `<figure class="photo-preview"><img src="${p.dataUrl}" alt="Pantry photo" /><figcaption>${esc(p.name)}</figcaption></figure>` : ""}
      <div class="action-row">
        <button type="button" class="btn btn-primary" data-action="identify" ${!p || state.busy ? "disabled" : ""}>
          ${state.busy === "identify" ? "Identifying…" : "Identify items"}
        </button>
        ${state.deviceProgress !== null && state.deviceProgress < 1 ? `<span class="muted">Downloading on-device model… ${Math.round(state.deviceProgress * 100)}%</span>` : ""}
      </div>
      ${state.itemsSource ? `<div class="result-meta">${badge(state.itemsSource, state.itemsLatency ?? undefined)}</div>` : ""}
      ${state.busy === "identify" ? `<p class="muted">${esc(state.busyNote) || "Reading your photo…"}</p>` : ""}
    </section>`;
}

function itemsSection(): string {
  return `
    <section class="card" id="step-items">
      <h2><span class="step-num">2</span> Your pantry</h2>
      <p class="muted">Check what was found — fix names and amounts, remove mistakes, add anything missing.</p>
      ${chipsHtml(state.items)}
      ${addItemFormHtml()}
      ${state.items.length > 0 ? `<button type="button" class="btn btn-ghost" data-action="clear-items">Clear pantry</button>` : ""}
    </section>`;
}

function recipesSection(): string {
  return `
    <section class="card" id="step-recipes">
      <h2><span class="step-num">3</span> What can I cook?</h2>
      <div class="prefs">
        <label>Diet
          <select id="diet">
            <option value="">No preference</option>
            <option value="vegetarian" ${state.diet === "vegetarian" ? "selected" : ""}>Vegetarian</option>
            <option value="vegan" ${state.diet === "vegan" ? "selected" : ""}>Vegan</option>
            <option value="low-carb" ${state.diet === "low-carb" ? "selected" : ""}>Low-carb</option>
            <option value="gluten-free" ${state.diet === "gluten-free" ? "selected" : ""}>Gluten-free</option>
          </select>
        </label>
        <label>Allergies
          <input id="allergies" type="text" placeholder="e.g. peanuts, dairy" value="${esc(state.allergies)}" />
        </label>
        <label>Servings
          <input id="servings" type="number" min="1" max="12" value="${state.servings}" />
        </label>
      </div>
      <div class="action-row">
        <button type="button" class="btn btn-primary" data-action="recipes" ${state.items.length === 0 || state.busy ? "disabled" : ""}>
          ${state.busy === "recipes" ? "Cooking up ideas…" : "What can I cook?"}
        </button>
      </div>
      ${state.recipesSource ? `<div class="result-meta">${badge(state.recipesSource, state.recipesLatency ?? undefined)}</div>` : ""}
      ${state.recipes ? recipeCardsHtml(state.recipes) : `<p class="muted">Three recipes from exactly what you have — missing ingredients flagged.</p>`}
    </section>`;
}

function planSection(): string {
  return `
    <section class="card" id="step-plan">
      <h2><span class="step-num">4</span> Plan the week</h2>
      <p class="muted">A 7-day plan and nutrition estimate, built in the cloud — it needs the whole week's context.</p>
      <div class="prefs">
        <label>Household size
          <input id="household" type="number" min="1" max="12" value="${state.household}" />
        </label>
      </div>
      <div class="action-row">
        <button type="button" class="btn btn-primary" data-action="plan" ${state.items.length === 0 || state.busy ? "disabled" : ""}>
          ${state.busy === "plan" ? "Planning your week…" : "Build my week"}
        </button>
      </div>
      ${state.planSource ? `<div class="result-meta">${badge(state.planSource, state.planLatency ?? undefined)}</div>` : ""}
      ${state.plan ? planHtml(state.plan) : ""}
      <h3>Shopping list</h3>
      ${shoppingListHtml(state.shopping, state.shoppingChecked)}
    </section>`;
}

function historySection(): string {
  if (state.history.length === 0) return "";
  return `
    <section class="card" id="step-history">
      <h2>Pantry history</h2>
      <ul class="history">
        ${state.history
          .map(
            (h) => `<li><strong>${new Date(h.when).toLocaleDateString()}</strong> — ${esc(h.photoName)} · ${h.items
              .map((i) => esc(i.name))
              .join(", ")}</li>`,
          )
          .join("")}
      </ul>
    </section>`;
}

function render(): void {
  appEl.innerHTML = `
    <header class="hero">
      <div>
        <h1>🥘 PantryPilot</h1>
        <p class="tagline">Photograph what's in your fridge. Get dinner ideas instantly — private on your device, with a full week planned in the cloud.</p>
      </div>
      ${statusPill()}
    </header>
    ${hybridExplainer()}
    ${setupBanner()}
    ${state.error ? `<div class="error" role="alert">${esc(state.error)} <button type="button" data-action="dismiss-error">Dismiss</button></div>` : ""}
    <main>
      ${photoSection()}
      ${itemsSection()}
      ${recipesSection()}
      ${planSection()}
      ${historySection()}
    </main>
    <footer class="footer">
      <p>PantryPilot — built for #BuildHybridAI 2026 with Firebase AI Logic.
      On-device: Gemini Nano · Cloud: Gemini. Your photos are read on-device
      when available and never leave the browser for the quick features.</p>
    </footer>`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function setBusy(id: string | null, note = ""): void {
  state.busy = id;
  state.busyNote = note;
  render();
}

function setError(message: string | null): void {
  state.error = message;
  render();
}

async function persistItems(): Promise<void> {
  await store.saveItems(state.items);
}

async function onIdentify(): Promise<void> {
  if (!state.photo || state.busy) return;
  setBusy("identify", "Reading your photo…");
  try {
    const result = await identifyItems(
      { data: state.photo.data, mimeType: state.photo.mimeType },
      (p) => {
        state.deviceProgress = p;
        render();
      },
    );
    state.deviceProgress = null;
    state.items = result.data;
    state.itemsSource = result.source;
    state.itemsLatency = result.latencyMs;
    state.recipes = null;
    state.recipesSource = null;
    state.plan = null;
    state.planSource = null;
    await persistItems();
    await store.addHistory({
      id: newId(),
      when: Date.now(),
      items: state.items,
      photoName: state.photo.name,
    });
    state.history = await store.loadHistory();
    setBusy(null);
  } catch (err) {
    state.deviceProgress = null;
    setBusy(null);
    setError(`Could not identify items: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function onRecipes(): Promise<void> {
  if (state.items.length === 0 || state.busy) return;
  setBusy("recipes");
  try {
    const result = await suggestRecipes(
      state.items,
      { diet: state.diet, allergies: state.allergies, servings: state.servings },
      (p) => {
        state.deviceProgress = p;
        render();
      },
    );
    state.deviceProgress = null;
    state.recipes = result.data;
    state.recipesSource = result.source;
    state.recipesLatency = result.latencyMs;
    setBusy(null);
  } catch (err) {
    state.deviceProgress = null;
    setBusy(null);
    setError(`Could not generate recipes: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function onPlan(): Promise<void> {
  if (state.items.length === 0 || state.busy) return;
  setBusy("plan");
  try {
    const result = await buildWeeklyPlan(
      state.items,
      { diet: state.diet, allergies: state.allergies, household: state.household },
    );
    state.plan = result.data;
    state.planSource = result.source;
    state.planLatency = result.latencyMs;
    state.shopping = result.data.shopping;
    state.shoppingChecked = new Set();
    await store.savePlan(state.plan);
    await store.saveShopping(state.shopping);
    setBusy(null);
  } catch (err) {
    setBusy(null);
    setError(`Could not build the weekly plan: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Events (delegated — survives re-renders)
// ---------------------------------------------------------------------------

appEl.addEventListener("click", (ev) => {
  const target = ev.target as HTMLElement;
  const actionEl = target.closest<HTMLElement>("[data-action]");
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === "identify") void onIdentify();
    else if (action === "recipes") void onRecipes();
    else if (action === "plan") void onPlan();
    else if (action === "clear-photo") {
      state.photo = null;
      render();
    } else if (action === "clear-items") {
      state.items = [];
      state.recipes = null;
      state.recipesSource = null;
      state.plan = null;
      state.planSource = null;
      state.shopping = [];
      void persistItems();
      render();
    } else if (action === "dismiss-error") {
      setError(null);
    }
    return;
  }
  const removeBtn = target.closest<HTMLElement>("[data-remove]");
  if (removeBtn) {
    const id = removeBtn.dataset.remove!;
    state.items = state.items.filter((i) => i.id !== id);
    void persistItems();
    render();
  }
});

appEl.addEventListener("change", (ev) => {
  const target = ev.target as HTMLInputElement;
  if (target.id === "photo-input" && target.files && target.files[0]) {
    const file = target.files[0];
    void photoFileToInlineData(file)
      .then((photo) => {
        state.photo = { ...photo, name: file.name };
        state.error = null;
        render();
      })
      .catch((err: unknown) => {
        setError(`Could not read that photo: ${err instanceof Error ? err.message : String(err)}`);
      });
    return;
  }
  if (target.classList.contains("chip-name")) {
    const item = state.items.find((i) => i.id === target.dataset.id);
    if (item) {
      item.name = target.value;
      void persistItems();
    }
    return;
  }
  if (target.classList.contains("chip-qty")) {
    const item = state.items.find((i) => i.id === target.dataset.id);
    if (item) {
      item.quantity = target.value;
      void persistItems();
    }
    return;
  }
  if (target.dataset.shop !== undefined) {
    const name = target.dataset.shop;
    if (target.checked) state.shoppingChecked.add(name);
    else state.shoppingChecked.delete(name);
    return;
  }
  if (target.id === "diet") state.diet = target.value;
  if (target.id === "allergies") state.allergies = target.value;
  if (target.id === "servings") state.servings = Math.max(1, Number(target.value) || 2);
  if (target.id === "household") state.household = Math.max(1, Number(target.value) || 2);
});

appEl.addEventListener("submit", (ev) => {
  const form = ev.target as HTMLFormElement;
  if (form.id === "add-item-form") {
    ev.preventDefault();
    const nameInput = form.querySelector<HTMLInputElement>("#add-item-name");
    const qtyInput = form.querySelector<HTMLInputElement>("#add-item-qty");
    const name = nameInput?.value.trim() ?? "";
    if (!name) return;
    state.items = addOrMergeItem(state.items, name, qtyInput?.value.trim() ?? "");
    void persistItems();
    render();
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot(): Promise<void> {
  initFirebase();
  if (aiEnabled) {
    const uid = await ensureAnonymousUser();
    const db = getDbInstance();
    if (uid && db) {
      store = firestoreStore({ db, uid });
    }
  }
  // Restore previous session (Firestore when connected, localStorage otherwise).
  state.items = await store.loadItems();
  state.plan = await store.loadPlan();
  state.shopping = await store.loadShopping();
  state.history = await store.loadHistory();
  if (state.plan) state.planSource = aiEnabled ? "in_cloud" : "demo";
  render();
}

void boot();
