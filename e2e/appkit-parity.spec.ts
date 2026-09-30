import { expect, test } from "@playwright/test";

test("navigation, routes directes, thèmes et clavier", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Aller au contenu principal" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.getByRole("link", { name: "Visualisations", exact: true }).click();
  await expect(page).toHaveURL(/\/visualizations$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Thème sombre", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/appkit-mobile-dark.png", fullPage: true });
  await page.getByRole("button", { name: "Thème clair", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/appkit-desktop-light.png", fullPage: true });
});

test("chargement et erreur de la page de visualisations", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/visualizations", async (route) => {
    await gate;
    await route.fulfill({ status: 503, body: "{}" });
  });
  await page.goto("/visualizations");
  await expect(page.getByRole("status").filter({ hasText: "Chargement des visualisations…" })).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toContainText("Démonstration indisponible");
});

test("analyses personnelles : vide, filtres, enregistrement, modification, ouverture et suppression", async ({ page }) => {
  await page.goto("/saved-analyses");
  // The existing contract forbids an in-memory personal identity in production.
  if (process.env.E2E_PRODUCTION === "1") {
    await expect(page.getByText("Les analyses personnelles ne sont pas activées dans cette application.")).toBeVisible();
    return;
  }
  await expect(page.getByRole("heading", { name: "Mes analyses", exact: true })).toBeVisible();
  await expect(page.getByText("Vous n’avez pas encore d’analyse enregistrée.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Ouvrir l’exemple d’analyse" }).click();
  await page.getByRole("combobox", { name: "Région", exact: true }).selectOption("north");
  await page.getByRole("combobox", { name: "Période", exact: true }).selectOption("90");
  await expect(page.getByRole("region", { name: "Analyse affichée" })).toContainText("Nord · 90 jours");
  await page.getByText("Enregistrer cette analyse", { exact: true }).click();
  await page.getByRole("textbox", { name: "Nom de l’analyse" }).fill("Mon analyse AppKit");
  const save = page.waitForRequest((request) => request.method() === "PUT" && request.url().includes("/api/saved-analyses/"));
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  expect((await save).postDataJSON()).toEqual({
    title: "Mon analyse AppKit", note: "",
    definition: { schemaVersion: 1, view: "example", filters: { region: "north", periodDays: 90 } },
  });
  await page.getByRole("link", { name: "Ouvrir Mes analyses" }).click();
  const card = page.getByRole("article").filter({ hasText: "Mon analyse AppKit" });
  await card.getByRole("button", { name: "Modifier" }).click();
  await card.getByRole("textbox", { name: "Note", exact: true }).fill("À revoir vendredi");
  await card.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(card.getByText("À revoir vendredi", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await expect(page.getByRole("region", { name: "Analyse affichée" })).toContainText("Nord · 90 jours");
  await page.getByRole("link", { name: "Mes analyses", exact: true }).click();
  await card.getByRole("button", { name: "Supprimer", exact: true }).click();
  await card.getByRole("button", { name: "Confirmer la suppression" }).click();
  await expect(card).toHaveCount(0);
});

test("le serveur AppKit conserve les limites HTTP, les erreurs sûres et les routes privées", async ({ request, baseURL }) => {
  const health = await request.get("/health");
  expect(health.ok()).toBe(true);
  const config = await request.get("/api/config");
  expect(Object.keys(await config.json()).sort()).toEqual([
    "appDescription", "appName", "mode", "personalStateDemo", "personalStateEnabled", "supportContact",
  ]);
  expect(config.headers()["cache-control"]).toBe("private, no-store");
  for (const path of ["/api/query/arbitrary", "/api/ui-variants/arbitrary"]) {
    const response = await request.post(path, { data: {} });
    expect(response.status()).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  }
  for (const { path, body, parsed } of [
    { path: "/api/genie/fraim-sales/messages", body: JSON.stringify({ content: "x".repeat(70_000) }), parsed: false },
    { path: "/api/saved-analyses/00000000-0000-4000-8000-000000000001", body: JSON.stringify({ title: "x".repeat(17_000) }), parsed: true },
    { path: "/api/saved-analyses/00000000-0000-4000-8000-000000000001", body: "{", parsed: false },
    { path: "/api/user-preferences", body: JSON.stringify({ content: "x".repeat(70_000) }), parsed: false },
    { path: "/api/genie/fraim-sales/session", body: "{", parsed: false },
  ]) {
    const response = await request.fetch(path, {
      method: path.includes("genie") ? "POST" : "PUT", data: Buffer.from(body),
      headers: { "content-type": "application/json", origin: baseURL!, "x-request-id": "bounded-http-test" },
    });
    const disabledPersonal = parsed && process.env.E2E_PRODUCTION === "1" && path.includes("saved-analyses");
    expect(response.status()).toBe(disabledPersonal ? 404 : 400);
    const payload = await response.json();
    expect(payload.error.code).toBe(disabledPersonal ? "USER_STATE_DISABLED" : "INVALID_REQUEST");
    expect(payload.error.requestId).toBe("bounded-http-test");
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(response.headers().vary).toContain("x-forwarded-user");
  }
});

test("une interruption Genie verrouille la conversation sans rejouer le POST", async ({ page }) => {
  let submissions = 0;
  await page.route("**/api/genie/fraim-sales/messages", async (route) => {
    submissions++;
    await route.abort("connectionreset");
  });
  await page.goto("/genie");
  const chat = page.getByRole("region", { name: "Les KPI et la conversation, côte à côte" })
    .getByRole("region", { name: "Conversation Genie, space fraim-sales" });
  await chat.getByRole("textbox", { name: "Question pour Genie" }).fill("Question interrompue");
  await chat.getByRole("textbox", { name: "Question pour Genie" }).press("Enter");
  await expect(chat.getByRole("textbox", { name: "Question pour Genie" })).toHaveCount(0);
  await expect(chat.getByRole("button", { name: /Réessayer/ })).toHaveCount(0);
  expect(submissions).toBe(1);
  await chat.getByRole("button", { name: "Démarrer une nouvelle conversation" }).click();
  await expect(chat.getByRole("textbox", { name: "Question pour Genie" })).toBeEnabled();
});
