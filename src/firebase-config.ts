// PantryPilot — Firebase configuration.
//
// This is the ONE file that holds the Firebase config. Right now it holds
// PLACEHOLDER values on purpose: no Firebase project exists yet, and creating
// one needs the owner's own Google account (see README.md, "Connect Firebase").
// Note: `.firebaserc` also names the project ("pantrypilot") — update it to
// the real project id when the project is created, so `firebase deploy`
// targets the right project.
//
// How to connect the app:
//   1. Create a Firebase project in the console (console.firebase.google.com).
//   2. In the console: AI Services > AI Logic > Get started, choose the
//      "Gemini Developer API" provider (no-cost tier, no billing).
//   3. Register the web app and copy its config object here, replacing every
//      PASTE_YOUR_* / YOUR_PROJECT_ID value below. Do NOT commit real secrets
//      to a public repo beyond this client config (it is meant to be public;
//      App Check is what protects the Gemini API).
//   4. If you use reCAPTCHA Enterprise for App Check in production, paste its
//      site key into `appCheckSiteKey` (registered in Console > App Check >
//      Fraud Defense). For local dev the app uses the App Check debug provider
//      instead (see src/ai.ts) — no site key needed.
//
// While the placeholders are in place, `isFirebaseConfigured` is false and
// the app runs in clearly-marked DEMO mode: the full UI works end-to-end
// with a local mock AI layer (src/mock.ts) so the flow can be tested without
// a project. The mock is never used once a real config is pasted in.

export const firebaseConfig = {
  apiKey: "AIzaSyDMHFQwHyZ0c6_vTLBO4VjiOCfXkvrG3nA",
  authDomain: "pantrypilot-93325.firebaseapp.com",
  projectId: "pantrypilot-93325",
  storageBucket: "pantrypilot-93325.firebasestorage.app",
  messagingSenderId: "247515349688",
  appId: "1:247515349688:web:275ac9ad57505c42c72a4d",
  measurementId: "G-CCWCQ8HBME",
} as const;

/** reCAPTCHA Enterprise site key for App Check in production (Fraud Defense). Leave empty for local dev. */
export const appCheckSiteKey = "6LcddS8uAAAAANK_blKi4bdB57NJCSXP2FGEwSPw";

/** True once a real Firebase config has been pasted into this file. */
export const isFirebaseConfigured: boolean =
  (firebaseConfig.apiKey as string) !== "PASTE_YOUR_API_KEY_HERE" &&
  (firebaseConfig.projectId as string) !== "YOUR_PROJECT_ID" &&
  (firebaseConfig.appId as string) !== "PASTE_YOUR_APP_ID_HERE";
