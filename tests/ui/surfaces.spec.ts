import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = ["/", "/product", "/platforms", "/pricing", "/download", "/privacy", "/sign-in"];

test("el sitio público expone las rutas del mapa", async ({ page }) => {
  for (const path of pages) {
    const response = await page.goto(path);
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("No hay precios");
});

test("el inicio no tiene violaciones críticas de accesibilidad", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  expect(serious).toEqual([]);
});

test("la consola exige la sesión demo y luego muestra el vacío", async ({ page }) => {
  await page.goto("http://127.0.0.1:3001/");
  await expect(page).toHaveURL(/sign-in/);
  await page.getByRole("button", { name: "Entrar con fixture sintético" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sin cobertura");
});

test("el manifiesto de la extensión no pide hosts obligatorios", () => {
  const manifestPath = path.resolve(process.cwd(), "../../apps/extension/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  expect(manifest.host_permissions ?? []).toEqual([]);
  expect(manifest.optional_host_permissions?.length).toBeGreaterThan(0);
});
