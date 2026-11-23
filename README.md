# PantryPilot 🥘

**Photograph what's in your fridge. Get dinner ideas instantly.**

PantryPilot is a web app built for the **#BuildHybridAI 2026** hackathon
(Google / Firebase on Devpost). It answers one everyday question — *"what's
for dinner?"* — using the food you already have, so less of it gets wasted
(about 20% of the food households buy is thrown away).

## How the hybrid AI works

The app uses **Firebase AI Logic** with one SDK call pattern and two
inference paths. Every AI answer in the UI is badged with the path that
actually ran (read from `response.inferenceSource`).

| Feature | Path | Why that path |
| --- | --- | --- |
| Photo → pantry items | **On-device first** (Gemini Nano, `PREFER_ON_DEVICE`) | Your photos are private household data; instant, free, works offline. Single-turn + structured JSON is exactly what Nano supports. |
| "What can I cook?" — 3 recipes | **On-device first** (Gemini Nano, `PREFER_ON_DEVICE`) | Same: fast, private, free. |
| Weekly meal plan + nutrition | **Cloud only** (Gemini, `ONLY_IN_CLOUD`) | Needs a whole week's items, preferences and allergies — long context and heavier reasoning. |
| Pantry history & shopping list | Firestore (anonymous auth) | Saved per user, no account needed. |

If Gemini Nano is unavailable, `PREFER_ON_DEVICE` falls back to the cloud
automatically — the app always works, and the badge says which path ran.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

## Connect Firebase (for real AI)

No Firebase project exists yet — creating one needs the owner's Google
account. Steps:

1. **Create a project** at [console.firebase.google.com](https://console.firebase.google.com).
2. **Enable AI Logic:** in the console go to **AI Services → AI Logic → Get started**.
   When asked for a Gemini API provider, choose **Gemini Developer API**
   (no-cost tier — no billing, no paid plan needed for this text-only app).
   The guided workflow enforces App Check automatically.
3. **Register the web app** in the console and copy its config object into
   `src/firebase-config.ts`, replacing the `PASTE_YOUR_*` placeholders.
   (That client config is meant to be public; App Check is what protects
   the Gemini API — never put server keys or secrets in the repo.)
4. **App Check debug token (local dev):** run the app once on localhost
   with `npm run dev`. The browser console prints an
   `AppCheck debug token: "..."`. Register it in the console under
   **Security → App Check → Apps → Manage debug tokens**. Debug tokens are
   explicitly accepted in hackathon submissions.
5. **Deploy (optional):**
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy
   ```
   The free Spark plan covers hosting + Firestore for this app.

### On-device requirements (Gemini Nano)

On-device inference only runs in **Chrome on Desktop v139+** with the flag
`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled. The
model downloads on first use (the app shows a progress bar). Everywhere else
the app still works — it falls back to the cloud and the badge says so.

## Demo video

For the Devpost submission the video (≤ 3 minutes, public on YouTube, in
English) should show: a pantry photo being read with the **On-device ·
Gemini Nano** badge, the three recipes with the same badge, then the weekly
plan with the **Cloud · Gemini** badge — plus one offline moment (Wi-Fi off,
on-device still answers). Record it in a real desktop Chrome with the
Gemini Nano flag enabled so the on-device path is genuine.

## Demo mode

While `src/firebase-config.ts` still holds placeholders, the app runs in
clearly-marked **demo mode**: the full flow (photo → items → recipes →
plan → shopping list) works end to end with a local mock AI layer
(`src/mock.ts`), and every result is badged **"Demo · mock AI"**. The mock
is never used once a real config is pasted in. Pantry data is saved to
localStorage in demo mode, and to Firestore (anonymous auth) once Firebase
is connected.

## Project structure

```
index.html                  Vite entry
src/main.ts                 UI shell, state, event wiring
src/ai.ts                   Firebase init, App Check, model setup, AI calls
src/firebase-config.ts      THE config file — paste the real config here
src/recipes.ts              Prompts + structured-output JSON schemas
src/pantry.ts               Data model, photo handling, persistence
src/mock.ts                 DEV-ONLY mock AI (demo mode, clearly marked)
src/ui/badge.ts             Inference-source badge
src/ui/chips.ts             Editable pantry item chips
src/ui/cards.ts             Recipe cards, weekly plan, shopping list
src/style.css               Styles
firebase.json               Firebase Hosting (free Spark plan)
firestore.rules             Per-user rules (anonymous users, own docs only)
```

## License

Apache 2.0 — see [LICENSE](LICENSE).
