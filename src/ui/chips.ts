// PantryPilot — editable pantry item chips.
//
// The model can misread a photo (Gemini Nano is small). Every detected item
// is an editable chip: rename it inline, fix the quantity, or remove it.
// The user can also add items by hand — the pantry is theirs, not the model's.

import type { PantryItem } from "../pantry";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function chipsHtml(items: PantryItem[]): string {
  if (items.length === 0) {
    return `<p class="muted">No items yet — upload a pantry photo and tap “Identify items”, or add items by hand below.</p>`;
  }
  return `
    <ul class="chips" aria-label="Pantry items" aria-live="polite">
      ${items
        .map(
          (it) => `
        <li class="chip" data-id="${it.id}">
          <input class="chip-name" data-id="${it.id}" value="${esc(it.name)}" aria-label="Item name" />
          <input class="chip-qty" data-id="${it.id}" value="${esc(it.quantity)}" placeholder="qty" aria-label="Quantity" />
          ${
            typeof it.confidence === "number"
              ? `<span class="chip-conf" title="Model confidence">${Math.round(it.confidence * 100)}%</span>`
              : ""
          }
          <button type="button" class="chip-remove" data-remove="${it.id}" aria-label="Remove ${esc(it.name)}">×</button>
        </li>`,
        )
        .join("")}
    </ul>`;
}

export function addItemFormHtml(): string {
  return `
    <form id="add-item-form" class="add-item" autocomplete="off">
      <input id="add-item-name" type="text" placeholder="Add an item, e.g. rice" aria-label="New item name" required />
      <input id="add-item-qty" type="text" placeholder="qty (optional)" aria-label="New item quantity" />
      <button type="submit" class="btn btn-secondary">+ Add</button>
    </form>`;
}
