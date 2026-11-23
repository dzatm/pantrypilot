// PantryPilot — prompts and structured-output schemas.
//
// Every AI feature returns JSON through a schema, so both inference paths
// (on-device Gemini Nano and cloud Gemini) produce the same shape:
//   - cloud:  `generationConfig: { responseMimeType: "application/json", responseSchema }`
//   - device: `promptOptions: { responseConstraint: <same schema> }`
// (see src/ai.ts). Schemas are built with the `Schema` helper from firebase/ai.

import { Schema } from "firebase/ai";

// ---------------------------------------------------------------------------
// Feature 1 — photo -> pantry items (ON-DEVICE)
// ---------------------------------------------------------------------------

export const itemsSchema = Schema.object({
  description: "The food items visible in a pantry/fridge photo.",
  properties: {
    items: Schema.array({
      description: "One entry per distinct food item clearly visible in the photo.",
      items: Schema.object({
        properties: {
          name: Schema.string({
            description: "Common name of the item, e.g. 'eggs', 'tomatoes', 'cheddar cheese'.",
          }),
          quantity: Schema.string({
            description: "Best estimate of the amount, e.g. '6', '1 bottle', 'about 500 g'.",
          }),
          confidence: Schema.number({
            description: "How sure you are the item is really there, 0 to 1.",
          }),
        },
        optionalProperties: ["quantity"],
      }),
    }),
  },
});

export const ITEMS_PROMPT = `Look at this photo of a fridge or pantry shelf.
List every distinct food item you can clearly identify. Only include items
you can actually see — do not guess items that are not visible. For each item
give its common name, your best estimate of the amount, and a confidence
score from 0 to 1. Skip packaging text and brand names; name the food itself.`;

// ---------------------------------------------------------------------------
// Feature 2 — "What can I cook?" (ON-DEVICE)
// ---------------------------------------------------------------------------

export const recipesSchema = Schema.object({
  description: "Three dinner recipes made mostly from the pantry items on hand.",
  properties: {
    recipes: Schema.array({
      description: "Exactly three recipes.",
      items: Schema.object({
        properties: {
          title: Schema.string({ description: "Short appetizing recipe name." }),
          minutes: Schema.number({
            description: "Total cooking time in minutes, realistic for a home cook.",
          }),
          difficulty: Schema.enumString({
            enum: ["easy", "medium", "hard"],
            description: "How hard the recipe is to make.",
          }),
          uses: Schema.array({
            description: "Pantry items this recipe uses, named exactly as in the pantry list.",
            items: Schema.string(),
          }),
          missing: Schema.array({
            description: "Ingredients the recipe needs that are NOT in the pantry (at most 3).",
            items: Schema.string(),
          }),
          steps: Schema.array({
            description: "Short numbered cooking steps, at most 6.",
            items: Schema.string(),
          }),
        },
      }),
    }),
  },
});

export function recipesPrompt(
  items: string[],
  opts: { diet: string; allergies: string; servings: number },
): string {
  const list = items.length > 0 ? items.join(", ") : "(the pantry is empty)";
  return `You are a home-cook assistant. The pantry contains: ${list}.
Dietary preference: ${opts.diet || "none"}. Allergies to avoid completely: ${
    opts.allergies || "none"
  }. Cooking for ${opts.servings} ${opts.servings === 1 ? "person" : "people"}.
Suggest exactly 3 different dinner recipes that use mostly the pantry items
above. Prefer recipes that use what is already there; each recipe may list at
most 3 missing ingredients. Keep steps short and practical.`;
}

// ---------------------------------------------------------------------------
// Feature 3 — weekly meal plan + nutrition (CLOUD — long context)
// ---------------------------------------------------------------------------

export const planSchema = Schema.object({
  description: "A 7-day dinner plan, a weekly nutrition estimate, and a shopping list.",
  properties: {
    days: Schema.array({
      description: "One entry per day, Monday first.",
      items: Schema.object({
        properties: {
          day: Schema.string({ description: "Day of the week, e.g. 'Monday'." }),
          breakfast: Schema.string({ description: "Short dish name." }),
          lunch: Schema.string({ description: "Short dish name." }),
          dinner: Schema.string({ description: "Short dish name." }),
        },
      }),
    }),
    nutrition: Schema.object({
      description: "Average daily nutrition estimate for the household.",
      properties: {
        caloriesPerDay: Schema.number({ description: "Average kcal per person per day." }),
        proteinG: Schema.number({ description: "Average grams of protein per person per day." }),
        carbsG: Schema.number({ description: "Average grams of carbs per person per day." }),
        fatG: Schema.number({ description: "Average grams of fat per person per day." }),
        note: Schema.string({
          description: "One sentence of nutrition advice for this plan.",
        }),
      },
    }),
    shopping: Schema.array({
      description: "What to buy for the week: items NOT already in the pantry.",
      items: Schema.string(),
    }),
  },
});

export function planPrompt(
  items: string[],
  opts: { diet: string; allergies: string; household: number },
): string {
  const list = items.length > 0 ? items.join(", ") : "(the pantry is empty)";
  return `You are a meal-planning assistant. Household size: ${opts.household} ${
    opts.household === 1 ? "person" : "people"
  }. Pantry already contains: ${list}.
Dietary preference: ${opts.diet || "none"}. Allergies to avoid completely: ${
    opts.allergies || "none"
  }.
Build a 7-day meal plan (Monday to Sunday), one breakfast, lunch and dinner
per day. Reuse the pantry items first and vary the meals so no dinner repeats.
Keep dish names short (a few words each) so the table stays readable.
Then estimate the average daily nutrition per person and list everything the
household still needs to buy for the week (only items NOT in the pantry).`;
}
