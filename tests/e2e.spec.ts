// PantryPilot end-to-end test (demo mode — mock AI, no Firebase project).
//
// Exercises the whole flow in a real Chromium:
//   photo upload -> identify items -> edit chips -> recipes -> weekly plan
//   -> shopping list -> reload (localStorage persistence).
// Also fails on any console error or uncaught page error.

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  // @ts-expect-error test-only attachment
  test.info().errors = errors;
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.afterEach(async ({ page }) => {
  // @ts-expect-error test-only attachment
  const errors: string[] = test.info().errors ?? [];
  expect(errors, `console/page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("full demo flow: photo -> items -> recipes -> plan -> shopping -> reload", async ({
  page,
}) => {
  // Landing state: demo mode, setup banner, steps visible.
  await expect(page.locator("h1")).toHaveText(/PantryPilot/);
  await expect(page.locator(".pill-demo")).toContainText("Demo mode");
  await expect(page.locator(".banner")).toContainText("Setup needed for real AI");
  await expect(page.locator("#step-photo h2")).toContainText("Snap your pantry");

  // Upload a pantry photo.
  await page.locator("#photo-input").setInputFiles("tests/fixtures/pantry-shelf.jpg");
  await expect(page.locator(".photo-preview img")).toBeVisible();
  await expect(page.locator(".photo-preview figcaption")).toContainText("pantry-shelf.jpg");

  // Identify items (mock) — 6 deterministic items + demo badge.
  await page.locator('[data-action="identify"]').click();
  await expect(page.locator(".chip-name").first()).toHaveValue("eggs", { timeout: 10_000 });
  const chipNames = await page.locator(".chip-name").evaluateAll((els) =>
    (els as HTMLInputElement[]).map((el) => el.value),
  );
  expect(chipNames).toEqual(["eggs", "tomatoes", "onion", "cheddar cheese", "pasta", "spinach"]);
  await expect(page.locator(".badge-demo").first()).toContainText("Demo · mock AI");

  // Edit a chip, add an item, remove a chip.
  const firstChip = page.locator(".chip-name").first();
  await firstChip.fill("free-range eggs");
  await firstChip.press("Tab"); // blur -> change event persists the edit
  await page.locator("#add-item-name").fill("rice");
  await page.locator("#add-item-qty").fill("1 kg");
  await page.locator("#add-item-form button[type=submit]").click();
  await expect(page.locator(".chip-name")).toHaveCount(7);
  await expect(page.locator(".chip-name").last()).toHaveValue("rice");
  await page.locator('[data-remove]').last().click();
  await expect(page.locator(".chip-name")).toHaveCount(6);

  // Recipes (mock) — exactly 3 cards, demo badge.
  await page.locator('[data-action="recipes"]').click();
  await expect(page.locator(".recipe-card")).toHaveCount(3, { timeout: 10_000 });
  await expect(page.locator(".recipe-card").first()).toContainText("Tomato & Cheese Pasta");
  await expect(page.locator(".recipe-card").nth(1)).toContainText("Spinach & Cheese Omelette");
  await expect(page.locator(".recipe-card").nth(2)).toContainText("Shakshuka-Style Eggs");
  await expect(page.locator("#step-recipes .badge-demo")).toContainText("Demo · mock AI");

  // Weekly plan (mock) — 7 rows, nutrition, shopping list, demo badge.
  await page.locator('[data-action="plan"]').click();
  await expect(page.locator(".plan-table tbody tr")).toHaveCount(7, { timeout: 10_000 });
  await expect(page.locator(".plan-table tbody tr").first()).toContainText("Monday");
  await expect(page.locator(".plan-table tbody tr").last()).toContainText("Sunday");
  await expect(page.locator(".nutrition")).toContainText("kcal");
  await expect(page.locator(".shopping li")).toHaveCount(9);
  await expect(page.locator("#step-plan .badge-demo")).toContainText("Demo · mock AI");

  // Check off a shopping item.
  await page.locator('[data-shop="garlic"]').check();
  await expect(page.locator('[data-shop="garlic"]')).toBeChecked();

  // History recorded the scan.
  await expect(page.locator("#step-history")).toContainText("pantry-shelf.jpg");

  // Reload: pantry items and plan persist via localStorage.
  await page.reload();
  await expect(page.locator(".chip-name").first()).toHaveValue("free-range eggs");
  await expect(page.locator(".chip-name")).toHaveCount(6);
  await expect(page.locator(".plan-table tbody tr")).toHaveCount(7);
});

test("photo input rejects a non-image file gracefully", async ({ page }) => {
  await page.locator("#photo-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.locator(".error")).toContainText("Could not read that photo");
});
