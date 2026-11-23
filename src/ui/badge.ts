// PantryPilot — the inference-source badge.
//
// Every AI result in the app carries one of these. The badge always states
// the path that ACTUALLY ran (read from `result.response.inferenceSource`),
// never the path we hoped for. That is the whole point of the hybrid story:
// the user — and the judges — can see privacy working.

import type { InferenceSource } from "../ai";

const LABELS: Record<InferenceSource, { text: string; cls: string; hint: string }> = {
  on_device: {
    text: "On-device · Gemini Nano",
    cls: "badge-device",
    hint: "Ran on this device. Your photo and pantry never left the browser.",
  },
  in_cloud: {
    text: "Cloud · Gemini",
    cls: "badge-cloud",
    hint: "Ran in the cloud — on-device was unavailable for this request, so Firebase AI Logic fell back automatically.",
  },
  demo: {
    text: "Demo · mock AI",
    cls: "badge-demo",
    hint: "Demo mode: no Firebase project is connected yet, so a local mock answered. Connect Firebase (README.md) for real on-device / cloud AI.",
  },
  unknown: {
    text: "AI · path not reported",
    cls: "badge-unknown",
    hint: "The model answered, but did not report which path ran.",
  },
};

export function badge(source: InferenceSource, latencyMs?: number): string {
  const { text, cls, hint } = LABELS[source];
  const time = latencyMs !== undefined ? ` · ${(latencyMs / 1000).toFixed(1)}s` : "";
  return `<span class="badge ${cls}" title="${hint}">${text}${time}</span>`;
}

/** Plain-text label for a source, for logs and tests. */
export function sourceLabel(source: InferenceSource): string {
  return LABELS[source].text;
}

/** One-line explanation of the hybrid split, shown under the header. */
export function hybridExplainer(): string {
  return `
    <details class="explainer">
      <summary>How the hybrid AI works — and why it matters</summary>
      <p>
        <strong>On your device (Gemini Nano):</strong> reading your pantry photo and
        suggesting tonight's recipes. Your photos stay private, it works offline,
        and it costs nothing.
        <strong>In the cloud (Gemini):</strong> the weekly plan and nutrition estimate,
        which need a whole week of context and heavier reasoning.
        Firebase AI Logic picks the path automatically and every answer is badged
        with the path that actually ran.
      </p>
    </details>`;
}
