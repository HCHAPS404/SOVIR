import { test, expect } from "@playwright/test";

// Smoke + a11y scaffold for the authenticated console.
// NOT_RUN in CI yet: sign-in needs a live API session; the spec drives the
// public surface (sign-in page) until session fixtures land (B21 live lane).

test.describe("console smoke", () => {
  test("sign-in page renders brand shell", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page).toHaveTitle(/SOVIR|Iniciar/i);
    // Basic a11y: exactly one h1, no duplicate landmarks.
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
  });

  test("unauthenticated deep link redirects to sign-in", async ({ page }) => {
    await page.goto("/incidents");
    await expect(page).toHaveURL(/sign-in/);
  });
});
