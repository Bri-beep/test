import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });

test("explorer un écart conserve le contexte, demande un envoi et épingle sans persister", async ({ page }) => {
  let submissions = 0;
  let stateWrites = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/genie/")) submissions++;
    if (["POST", "PUT"].includes(request.method()) && request.url().includes("/api/saved-analyses")) stateWrites++;
  });
  await page.goto("/visualizations");
  const comparison = page.getByRole("region", { name: "Comparer deux périodes", exact: true });
  const explore = comparison.getByRole("button", { name: "Explorer cet écart avec Genie", exact: true });
  await expect(explore).toBeEnabled();
  await comparison.getByLabel("Segment commun aux deux périodes").selectOption('"Web"');
  await expect(explore).toBeDisabled();
  await comparison.getByRole("button", { name: "Comparer les périodes", exact: true }).click();
  await expect(explore).toBeEnabled();
  await explore.focus();
  await page.keyboard.press("Enter");
  const chat = comparison.getByRole("region", { name: "Conversation Genie, space fraim-sales" });
  const input = chat.getByRole("textbox", { name: "Question pour Genie" });
  await expect(input).toHaveValue(/2026-08-18–2026-08-31/);
  await expect(input).toBeFocused();
  await expect(chat.getByText("Démo synthétique · aucune connexion", { exact: true })).toBeVisible();
  expect(submissions).toBe(0);
  const sent = page.waitForRequest((request) => request.method() === "POST" && request.url().includes("/api/genie/"));
  await input.press("Enter");
  const payload = (await sent).postDataJSON();
  expect(payload.context.comparison).toMatchObject({ synthetic: true,
    currentPeriod: { start: "2026-09-01", end: "2026-09-14" }, referencePeriod: { start: "2026-08-18", end: "2026-08-31" } });
  expect(payload.context.filters.segment).toContain("Web");
  await expect(chat.getByText(/Aucune requête Databricks n’a été exécutée/)).toBeVisible();
  await chat.getByRole("button", { name: "Épingler ce résultat au dashboard", exact: true }).click();
  await expect(comparison.getByRole("region", { name: "Résultats épinglés de la comparaison" })).toBeVisible();
  expect(submissions).toBe(1);
  expect(stateWrites).toBe(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== "analytics-theme"))).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  await page.getByRole("button", { name: "Thème sombre", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await comparison.screenshot({ path: "test-results/comparison-genie-mobile-dark.png" });
  await comparison.getByLabel("Comparer avec").selectOption("previous-year");
  await comparison.getByRole("button", { name: "Comparer les périodes", exact: true }).click();
  await expect(chat).toHaveCount(0);
  await expect(comparison.getByRole("region", { name: "Résultats épinglés de la comparaison" })).toHaveCount(0);
  await explore.click();
  await expect(input).toHaveValue(/2025-09-01–2025-09-14/);
  expect(submissions).toBe(1);
});

test("périodes, filtre commun, décomposition et tableau accessible", async ({ page }) => {
  await page.goto("/visualizations");
  const comparison = page.getByRole("region", { name: "Comparer deux périodes", exact: true });
  await expect(comparison.getByRole("heading", { name: "Décomposition de l’écart" })).toBeVisible();
  await expect(comparison.getByText("1 sept. 2026 – 14 sept. 2026 · 14 jours", { exact: true })).toBeVisible();
  await expect(comparison.getByText("18 août 2026 – 31 août 2026 · 14 jours", { exact: true })).toBeVisible();
  const details = comparison.getByText("Voir toutes les contributions", { exact: true });
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(comparison.getByRole("table", { name: /Contributions exactes/ })).toContainText("Application");
  await comparison.getByLabel("Segment commun aux deux périodes").selectOption('"Web"');
  await comparison.getByRole("button", { name: "Comparer les périodes" }).click();
  await expect(comparison.getByRole("status").filter({ hasText: "Segment : Web" })).toBeVisible();
  await comparison.getByText("Voir toutes les contributions", { exact: true }).click();
  await expect(comparison.getByRole("table", { name: /Contributions exactes/ })).toContainText("Web");
  await expect(comparison.getByRole("table", { name: /Contributions exactes/ })).not.toContainText("Magasin");
  await comparison.getByLabel("Comparer avec").selectOption("previous-year");
  await comparison.getByRole("button", { name: "Comparer les périodes" }).click();
  await expect(comparison.getByText("1 sept. 2025 – 14 sept. 2025 · 14 jours", { exact: true })).toBeVisible();
  await comparison.getByText("Voir les valeurs par jour", { exact: true }).click();
  await expect(comparison.getByRole("table", { name: /Comparaison quotidienne/ })).toContainText("14 sept. 2025");
});

test("référence personnalisée, périodes partielles et absence de données", async ({ page }) => {
  await page.goto("/visualizations");
  const comparison = page.getByRole("region", { name: "Comparer deux périodes", exact: true });
  await expect(comparison.getByRole("heading", { name: "Décomposition de l’écart" })).toBeVisible();
  await comparison.getByLabel("Comparer avec").selectOption("custom");
  await comparison.getByLabel("Début de la référence").fill("2026-08-01");
  await comparison.getByLabel("Fin de la référence").fill("2026-08-07");
  await comparison.getByRole("button", { name: "Comparer les périodes" }).click();
  await expect(comparison.getByText(/durées différentes/)).toBeVisible();
  await expect(comparison.getByText("1 août 2026 – 7 août 2026 · 7 jours", { exact: true })).toBeVisible();
  await comparison.getByLabel("Comparer avec").selectOption("previous-period");
  await comparison.getByLabel("Début de la période analysée").fill("2026-09-19");
  await comparison.getByLabel("Fin de la période analysée").fill("2026-09-22");
  await comparison.getByRole("button", { name: "Comparer les périodes" }).click();
  await expect(comparison.getByText(/Période partielle/)).toBeVisible();
  await comparison.getByLabel("Début de la période analysée").fill("2023-09-01");
  await comparison.getByLabel("Fin de la période analysée").fill("2023-09-14");
  await comparison.getByRole("button", { name: "Comparer les périodes" }).click();
  await expect(comparison.getByText("Aucune donnée sur ces périodes", { exact: true })).toBeVisible();
  await expect(comparison.getByRole("heading", { name: "Décomposition de l’écart" })).toHaveCount(0);
});

test("chargement, erreur sûre et reprise explicite", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/period-comparison/demo?*", async (route) => {
    await gate;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SQL_QUERY_FAILED", message: "Les données sont indisponibles.", requestId: "comparison-e2e" } }) });
  });
  await page.goto("/visualizations");
  await expect(page.getByRole("status").filter({ hasText: "Comparaison des périodes…" })).toBeVisible();
  release();
  await expect(page.getByRole("alert").filter({ hasText: "Comparaison indisponible" })).toContainText("comparison-e2e");
  await page.unroute("**/api/period-comparison/demo?*");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Décomposition de l’écart" })).toBeVisible();
});

test("un ancien résultat ne remplace pas la sélection suivante", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/period-comparison/demo?*", async (route) => {
    // StrictMode may start the initial request twice; hold that selection, not an attempt number.
    if (new URL(route.request().url()).searchParams.get("mode") === "previous-period") await gate;
    await route.continue();
  });
  await page.goto("/visualizations");
  await expect(page.getByRole("status").filter({ hasText: "Comparaison des périodes…" })).toBeVisible();
  await page.getByLabel("Comparer avec").selectOption("previous-year");
  await page.getByRole("button", { name: "Comparer les périodes" }).click();
  await expect(page.getByText("1 sept. 2025 – 14 sept. 2025 · 14 jours", { exact: true })).toBeVisible();
  release();
  await expect(page.getByText("18 août 2026 – 31 août 2026 · 14 jours", { exact: true })).toHaveCount(0);
});

test("thèmes, mobile et contrôle des contributions au clavier", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/visualizations");
  const comparison = page.getByRole("region", { name: "Comparer deux périodes", exact: true });
  await expect(comparison.getByRole("heading", { name: "Décomposition de l’écart" })).toBeVisible();
  await comparison.screenshot({ path: "test-results/comparison-desktop-light.png" });
  await page.getByRole("button", { name: "Thème sombre", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const series = comparison.getByRole("figure", { name: /^Évolution comparée\./ });
  const amounts = series.locator(".recharts-cartesian-axis-tick-value").filter({ hasText: "€" });
  await expect(amounts.first()).toBeVisible();
  await expect.poll(() => amounts.evaluateAll((labels) =>
    labels.flatMap((label) => {
      const svg = label.closest("svg")!.getBoundingClientRect();
      const bounds = label.getBoundingClientRect();
      return bounds.left >= svg.left - 1 && bounds.right <= svg.right + 1 ? [] : [{ text: label.textContent, left: bounds.left - svg.left, right: bounds.right - svg.right }];
    }),
  )).toEqual([]);
  await comparison.getByText("Voir toutes les contributions", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(comparison.getByRole("table", { name: /Contributions exactes/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await comparison.screenshot({ path: "test-results/comparison-mobile-dark.png" });
});
