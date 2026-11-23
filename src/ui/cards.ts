// PantryPilot — recipe cards, weekly plan, and shopping list renderers.

import type { Recipe, WeeklyPlan } from "../pantry";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function recipeCardsHtml(recipes: Recipe[]): string {
  if (recipes.length === 0) {
    return `<p class="muted">No recipes came back — try again, or check the pantry list.</p>`;
  }
  return `
    <div class="recipe-grid">
      ${recipes
        .map(
          (r) => `
        <article class="recipe-card">
          <h3>${esc(r.title)}</h3>
          <p class="recipe-meta">⏱ ${r.minutes} min · ${esc(r.difficulty)}</p>
          <p><strong>Uses:</strong> ${r.uses.map(esc).join(", ") || "—"}</p>
          <p><strong>Missing:</strong> ${
            r.missing.length > 0 ? r.missing.map(esc).join(", ") : "nothing — you have it all"
          }</p>
          <ol class="recipe-steps">
            ${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}
          </ol>
        </article>`,
        )
        .join("")}
    </div>`;
}

export function planHtml(plan: WeeklyPlan): string {
  const n = plan.nutrition;
  return `
    <div class="plan-wrap">
      <table class="plan-table">
        <thead><tr><th>Day</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th></tr></thead>
        <tbody>
          ${plan.days
            .map(
              (d) => `<tr><th>${esc(d.day)}</th><td>${esc(d.breakfast)}</td><td>${esc(d.lunch)}</td><td>${esc(d.dinner)}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <aside class="nutrition">
        <h3>Average per person, per day</h3>
        <p class="nutrition-numbers">
          <span><strong>${n.caloriesPerDay}</strong> kcal</span>
          <span><strong>${n.proteinG} g</strong> protein</span>
          <span><strong>${n.carbsG} g</strong> carbs</span>
          <span><strong>${n.fatG} g</strong> fat</span>
        </p>
        <p class="muted">${esc(n.note)}</p>
      </aside>
    </div>`;
}

export function shoppingListHtml(shopping: string[], checked: Set<string>): string {
  if (shopping.length === 0) {
    return `<p class="muted">Nothing to buy — the plan uses only what you already have.</p>`;
  }
  return `
    <ul class="shopping">
      ${shopping
        .map(
          (name) => `
        <li>
          <label>
            <input type="checkbox" data-shop="${esc(name)}" ${checked.has(name) ? "checked" : ""} />
            <span>${esc(name)}</span>
          </label>
        </li>`,
        )
        .join("")}
    </ul>`;
}
