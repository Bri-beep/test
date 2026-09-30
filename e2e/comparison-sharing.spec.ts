import { expect, test, type Page } from "@playwright/test";
import type { ComparisonResult } from "../src/features/period-comparison/contract";

const endpoint = "**/api/period-comparison/demo?*";
const normalizeSpaces = (text: string) => text.replace(/\s+/g, " ");
const number = (value: number) => normalizeSpaces(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value));
const comparison = (page: Page) => page.getByRole("region", { name: "Comparer deux périodes", exact: true });
const shareButton = (page: Page) => comparison(page).getByRole("button", { name: "Partager cette analyse", exact: true });
const sharePanel = (page: Page) => page.getByRole("dialog", { name: "Partager cette analyse", exact: true });
const isComparisonResponse = (response: { url(): string; ok(): boolean }) => response.url().includes("/api/period-comparison/demo?") && response.ok();

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });

test("partager une comparaison filtrée copie une définition et recalcule les mêmes valeurs à l’ouverture", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  let stateWrites = 0;
  context.on("request", (request) => {
    if (["POST", "PUT", "DELETE"].includes(request.method())
      && /\/api\/(saved-analyses|user-preferences)/.test(request.url())) stateWrites++;
  });
  await page.goto("/visualizations?private-context=must-not-share#period-comparison");
  await expect(shareButton(page)).toBeEnabled();
  await comparison(page).getByLabel("Segment commun aux deux périodes").selectOption('"Web"');
  await comparison(page).getByLabel("Comparer avec").selectOption("custom");
  await comparison(page).getByLabel("Début de la référence").fill("2026-08-01");
  await comparison(page).getByLabel("Fin de la référence").fill("2026-08-07");
  const applied = page.waitForResponse(isComparisonResponse);
  await comparison(page).getByRole("button", { name: "Comparer les périodes", exact: true }).click();
  const result: ComparisonResult = await (await applied).json();
  await expect(shareButton(page)).toBeEnabled();
  await shareButton(page).focus();
  await page.keyboard.press("Enter");
  const panel = sharePanel(page);
  await expect(panel).toBeVisible();
  const linkField = panel.getByLabel("Lien de l’analyse", { exact: true });
  const summaryField = panel.getByLabel("Synthèse à partager", { exact: true });
  await expect(linkField).toHaveAttribute("readonly", "");
  await expect(summaryField).toHaveAttribute("readonly", "");
  const link = await linkField.inputValue();
  const url = new URL(link);
  expect(url.origin).toBe(new URL(baseURL!).origin);
  expect(url.pathname).toBe("/visualizations");
  expect(url.search).toBe("");
  expect(url.hash).toMatch(/^#comparison=/);
  expect(JSON.parse(decodeURIComponent(url.hash.slice("#comparison=".length)))).toEqual({
    version: 1, key: "demo-orders", start: "2026-09-01", end: "2026-09-14", mode: "custom",
    referenceStart: "2026-08-01", referenceEnd: "2026-08-07", segment: '"Web"',
  });
  expect(link).not.toContain("must-not-share");
  const summary = await summaryField.inputValue();
  const readable = normalizeSpaces(summary);
  expect(summary).toContain(result.label);
  expect(summary).toContain(result.unit);
  expect(summary).toContain(result.sourceLabel);
  expect(summary).toContain("Web");
  for (const period of Object.values(result.periods)) {
    expect(summary).toContain(period.start);
    expect(summary).toContain(period.end);
  }
  for (const value of [result.current.value, result.reference.value, result.change.absolute]) {
    expect(value).not.toBeNull();
    expect(readable).toContain(number(value!));
  }
  for (const warning of result.warnings) expect(summary).toContain(warning);
  if (result.change.percent !== null) expect(readable).toContain(number(result.change.percent));
  expect(summary).toMatch(/synthétiques/i);
  expect(summary).toMatch(/Consulté le : \d{4}-\d{2}-\d{2}T/);
  expect(summary).toContain("pas de fraîcheur des données");
  await panel.screenshot({ path: "test-results/comparison-sharing-desktop-light.png" });
  await panel.getByRole("button", { name: "Copier le lien", exact: true }).click();
  await expect(panel.getByText("Lien copié.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await panel.getByRole("button", { name: "Copier la synthèse", exact: true }).click();
  await expect(panel.getByText("Synthèse copiée.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(summary);

  const reopened = await context.newPage();
  await reopened.emulateMedia({ reducedMotion: "reduce" });
  const recalculated = reopened.waitForResponse(isComparisonResponse);
  await reopened.goto(link);
  const fresh: ComparisonResult = await (await recalculated).json();
  await expect(comparison(reopened).getByLabel("Segment commun aux deux périodes")).toHaveValue('"Web"');
  await expect(comparison(reopened).getByLabel("Comparer avec")).toHaveValue("custom");
  await expect(comparison(reopened).getByLabel("Début de la référence")).toHaveValue("2026-08-01");
  await expect(comparison(reopened).getByLabel("Fin de la référence")).toHaveValue("2026-08-07");
  expect(fresh.current).toEqual(result.current);
  expect(fresh.reference).toEqual(result.reference);
  expect(fresh.change).toEqual(result.change);
  await expect(shareButton(reopened)).toBeEnabled();
  await shareButton(reopened).click();
  expect(normalizeSpaces(await sharePanel(reopened).getByLabel("Synthèse à partager", { exact: true }).inputValue()))
    .toContain(number(result.current.value!));
  expect(stateWrites).toBe(0);
  for (const tab of [page, reopened]) {
    expect(await tab.evaluate(() => Object.keys(localStorage).filter((key) => key !== "analytics-theme"))).toEqual([]);
    expect(await tab.evaluate(() => sessionStorage.length)).toBe(0);
  }
});

test("le partage reste lié aux résultats appliqués malgré une réponse tardive ou une erreur", async ({ page }) => {
  await page.goto("/visualizations");
  await expect(shareButton(page)).toBeEnabled();
  await comparison(page).getByLabel("Fin de la période analysée").fill("2026-09-13");
  await expect(shareButton(page)).toBeDisabled();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(endpoint, async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") === "previous-year") await gate;
    await route.continue();
  });
  await comparison(page).getByLabel("Comparer avec").selectOption("previous-year");
  const pending = page.waitForRequest((request) => request.url().includes("/api/period-comparison/demo?")
    && new URL(request.url()).searchParams.get("mode") === "previous-year");
  await comparison(page).getByRole("button", { name: "Comparer les périodes", exact: true }).click();
  await pending;
  await expect(comparison(page).getByRole("status").filter({ hasText: "Comparaison des périodes…" })).toBeVisible();
  await expect(shareButton(page)).toHaveCount(0);
  await comparison(page).getByLabel("Comparer avec").selectOption("previous-period");
  await comparison(page).getByRole("button", { name: "Comparer les périodes", exact: true }).click();
  await expect(shareButton(page)).toBeEnabled();
  release();
  await shareButton(page).click();
  const shared = new URL(await sharePanel(page).getByLabel("Lien de l’analyse", { exact: true }).inputValue());
  const definition = JSON.parse(decodeURIComponent(shared.hash.slice("#comparison=".length)));
  expect(definition).toMatchObject({ end: "2026-09-13", mode: "previous-period", referenceStart: "2026-08-19", referenceEnd: "2026-08-31" });
  const summary = await sharePanel(page).getByLabel("Synthèse à partager", { exact: true }).inputValue();
  expect(summary).toContain("2026-08-19");
  expect(summary).not.toContain("2025-09-01");
  await page.keyboard.press("Escape");
  await page.unroute(endpoint);
  await page.route(endpoint, (route) => route.fulfill({ status: 503, contentType: "application/json",
    body: JSON.stringify({ error: { message: "Indisponible pour cet essai.", requestId: "sharing-error" } }) }));
  await comparison(page).getByRole("button", { name: "Comparer les périodes", exact: true }).click();
  await expect(comparison(page).getByRole("alert")).toContainText("sharing-error");
  await expect(shareButton(page)).toHaveCount(0);
  await expect(sharePanel(page)).toHaveCount(0);
  await page.unroute(endpoint);
  await comparison(page).getByLabel("Début de la période analysée").fill("2023-09-01");
  await comparison(page).getByLabel("Fin de la période analysée").fill("2023-09-14");
  await comparison(page).getByRole("button", { name: "Comparer les périodes", exact: true }).click();
  await expect(comparison(page).getByText("Aucune donnée sur ces périodes", { exact: true })).toBeVisible();
  await expect(shareButton(page)).toBeDisabled();
  await expect(comparison(page).getByText("Aucune valeur disponible à partager sur ces périodes.", { exact: true })).toBeVisible();
});

test("un lien invalide est signalé sans requête implicite et une ancre ordinaire reste utilisable", async ({ page }) => {
  let queries = 0;
  page.on("request", (request) => { if (request.url().includes("/api/period-comparison/demo?")) queries++; });
  const valid = { version: 1, key: "demo-orders", start: "2026-09-01", end: "2026-09-14", mode: "previous-period",
    referenceStart: "2026-08-18", referenceEnd: "2026-08-31" };
  const hashes = ["#comparison=%broken", ...[
    { ...valid, key: "unknown-comparison" }, { ...valid, sql: "SELECT private" },
    { ...valid, referenceStart: "2025-08-18" },
  ].map((definition) => `#comparison=${encodeURIComponent(JSON.stringify(definition))}`)];
  for (const hash of hashes) {
    await page.goto("about:blank");
    await page.goto(`/visualizations${hash}`);
    await expect(comparison(page).getByRole("alert")).toContainText("Lien de comparaison invalide");
    expect(queries).toBe(0);
    await expect(shareButton(page)).toHaveCount(0);
  }
  await comparison(page).getByRole("button", { name: "Comparer les périodes", exact: true }).click();
  await expect(shareButton(page)).toBeEnabled();
  expect(queries).toBeGreaterThan(0);
  const beforeAnchor = queries;
  await page.goto("about:blank");
  await page.goto("/visualizations#comparison-results");
  await expect(shareButton(page)).toBeEnabled();
  expect(queries).toBeGreaterThan(beforeAnchor);
  await expect(comparison(page).getByRole("alert")).toHaveCount(0);
});

test("le secours de copie reste utilisable au clavier sur mobile sombre", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: { writeText: async () => { throw new DOMException("Clipboard unavailable", "NotAllowedError"); } } });
  });
  await page.goto("/visualizations");
  await expect(shareButton(page)).toBeEnabled();
  await page.getByRole("button", { name: "Thème sombre", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await shareButton(page).focus();
  await page.keyboard.press("Enter");
  const panel = sharePanel(page);
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Copier le lien", exact: true }).click();
  await expect(panel.getByText("La copie automatique est indisponible. Sélectionnez le texte puis copiez-le.", { exact: true })).toBeVisible();
  const link = panel.getByLabel("Lien de l’analyse", { exact: true });
  await link.focus();
  await link.press("ControlOrMeta+A");
  expect(await link.evaluate((element) => {
    const field = element as HTMLInputElement;
    return field.selectionEnd! - field.selectionStart!;
  })).toBe((await link.inputValue()).length);
  await panel.getByRole("button", { name: "Copier la synthèse", exact: true }).click();
  await expect(panel.getByLabel("Synthèse à partager", { exact: true })).toHaveValue(/Montant des commandes/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.screenshot({ path: "test-results/comparison-sharing-mobile-dark.png" });
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(shareButton(page)).toBeFocused();
});
