// PantryPilot — DEV-ONLY mock AI layer.
//
// *** This file is a stand-in, not the product. ***
// It exists so the full UI flow (photo -> items -> recipes -> plan -> shopping
// list) can be exercised end to end in environments without Gemini Nano and
// without a Firebase project (e.g. this sandbox, Playwright tests).
//
// Rules for the mock:
//   - It is used ONLY when no real Firebase config is present
//     (see src/ai.ts: `isFirebaseConfigured === false`), or when the URL has
//     `?mock=1`. It is NEVER used once a real config is pasted in.
//   - Every mock result is labelled `source: "demo"` and the UI shows a
//     "Demo · mock AI" badge — it never pretends to be on-device or cloud.
//   - The data is deterministic and plausible, so tests can assert on it.
//   - The user can edit every item the mock returns (editable chips), exactly
//     as they would correct a real model.

import type { PantryItem, Recipe, WeeklyPlan } from "./pantry";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function mockIdentifyItems(): Promise<PantryItem[]> {
  await wait(900);
  return [
    { id: "m1", name: "eggs", quantity: "6", confidence: 0.95 },
    { id: "m2", name: "tomatoes", quantity: "4", confidence: 0.9 },
    { id: "m3", name: "onion", quantity: "2", confidence: 0.85 },
    { id: "m4", name: "cheddar cheese", quantity: "200 g", confidence: 0.8 },
    { id: "m5", name: "pasta", quantity: "500 g", confidence: 0.92 },
    { id: "m6", name: "spinach", quantity: "1 bag", confidence: 0.7 },
  ];
}

export async function mockSuggestRecipes(items: PantryItem[]): Promise<Recipe[]> {
  await wait(1100);
  const names = items.map((i) => i.name).join(", ");
  void names;
  return [
    {
      title: "Tomato & Cheese Pasta",
      minutes: 25,
      difficulty: "easy",
      uses: ["pasta", "tomatoes", "cheddar cheese", "onion"],
      missing: ["olive oil", "garlic"],
      steps: [
        "Boil the pasta in salted water until al dente.",
        "Soften the diced onion in a pan, add chopped tomatoes and simmer 10 minutes.",
        "Toss the pasta through the sauce and fold in grated cheddar.",
        "Serve with cracked black pepper.",
      ],
    },
    {
      title: "Spinach & Cheese Omelette",
      minutes: 12,
      difficulty: "easy",
      uses: ["eggs", "spinach", "cheddar cheese", "onion"],
      missing: ["butter"],
      steps: [
        "Whisk the eggs with a pinch of salt.",
        "Wilt the spinach and onion in a pan.",
        "Pour in the eggs, add the cheese, and fold when set.",
      ],
    },
    {
      title: "Shakshuka-Style Eggs",
      minutes: 30,
      difficulty: "medium",
      uses: ["eggs", "tomatoes", "onion", "spinach"],
      missing: ["cumin", "crusty bread"],
      steps: [
        "Simmer tomatoes and onion into a thick sauce.",
        "Make wells in the sauce and crack in the eggs.",
        "Cover and cook until the whites set, about 8 minutes.",
        "Scatter spinach on top and serve with bread.",
      ],
    },
  ];
}

export async function mockBuildPlan(_items: PantryItem[]): Promise<WeeklyPlan> {
  await wait(1300);
  // Deterministic on purpose: the same pantry always yields the same plan,
  // so the Playwright test can assert on exact rows.
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const dinners = [
    "Tomato & Cheese Pasta",
    "Spinach & Cheese Omelette",
    "Shakshuka-Style Eggs",
    "Pasta with Garlic Spinach",
    "Tomato Soup & Grilled Cheese",
    "Egg Fried Rice",
    "Pasta Bake with Tomatoes",
  ];
  return {
    days: days.map((day, i) => ({
      day,
      breakfast: ["Omelette & toast", "Yogurt & fruit", "Eggs on toast", "Pancakes", "Cheese toastie", "Fruit & yogurt", "Omelette & spinach"][i],
      lunch: ["Pasta leftovers", "Tomato soup", "Cheese sandwich", "Spinach salad", "Egg sandwich", "Pasta salad", "Soup & toast"][i],
      dinner: dinners[i],
    })),
    nutrition: {
      caloriesPerDay: 1950,
      proteinG: 82,
      carbsG: 210,
      fatG: 68,
      note: "Balanced for an average adult; add a protein source on the lighter days.",
    },
    shopping: ["olive oil", "garlic", "butter", "cumin", "crusty bread", "yogurt", "fruit", "rice", "bread"],
  };
}
