import { expect, test } from "@playwright/test";

test.describe("Genie conversationnel", () => {
  test("transmet le contexte, rend le résultat et épingle une carte", async ({ page }) => {
    await page.goto("/genie");

    await expect(page.getByRole("heading", { name: "Passez du signal à la question, sans quitter le dashboard" })).toBeVisible();
    await page.getByRole("combobox", { name: "Région", exact: true }).selectOption({ label: "France" });
    await page.getByRole("combobox", { name: "Période", exact: true }).selectOption({ label: "12 derniers mois" });

    const embeddedSection = page.getByRole("region", {
      name: "Les KPI et la conversation, côte à côte",
    });
    const chat = embeddedSection.getByRole("region", {
      name: "Conversation Genie, space fraim-sales",
    });
    await expect(chat.getByText("région : France", { exact: true }).first()).toBeVisible();
    await expect(chat.getByText("12 derniers mois", { exact: true }).first()).toBeVisible();

    const firstRequestPromise = page.waitForRequest((request) =>
      request.method() === "POST" && request.url().includes("/api/genie/fraim-sales/messages"),
    );
    const composer = chat.getByRole("textbox", { name: "Question pour Genie" });
    await composer.fill("Quels produits sous-performent avec ces filtres ?");
    await composer.press("Enter");
    const firstRequest = await firstRequestPromise;
    const firstPayload = firstRequest.postDataJSON();
    expect(firstPayload).toMatchObject({
      content: "Quels produits sous-performent avec ces filtres ?",
      context: {
        filters: { région: "France" },
        dateRange: { label: "12 derniers mois" },
      },
    });
    expect(firstPayload.conversationId).toBeUndefined();

    await expect(chat.getByText("Requête en cours", { exact: true }).first()).toBeAttached();
    await expect(chat.getByText(/Produit Alpha mérite l’attention/)).toBeVisible();
    await expect(chat.getByRole("figure", { name: "Graphique de Produits à surveiller" })).toBeVisible();
    await chat.getByText("Voir les données exactes", { exact: true }).click();
    const resultTable = chat.getByRole("table", { name: "Produits à surveiller" });
    await expect(resultTable).toBeVisible();
    await expect(resultTable.getByText("Produit Alpha", { exact: true })).toBeVisible();

    await chat.locator("summary").filter({ hasText: "Requête générée" }).click();
    await expect(chat.getByText("FROM demo.sales_performance", { exact: false })).toBeVisible();

    await chat.getByRole("button", { name: "Épingler ce résultat au dashboard" }).click();
    const pinnedSection = page.getByRole("region", { name: "Éléments épinglés" });
    await expect(pinnedSection.getByRole("heading", { name: "Produits à surveiller" })).toBeVisible();

    const followUpRequestPromise = page.waitForRequest((request) =>
      request.method() === "POST" && request.url().includes("/api/genie/fraim-sales/messages"),
    );
    const historyToggle = chat.getByLabel("Ouvrir l’historique des conversations");
    const historyPanel = historyToggle.locator("..");
    await historyToggle.click();
    await expect(historyPanel).toHaveAttribute("open", "");
    await chat.getByRole("button", { name: "Quelle région explique le plus cette baisse ?" }).click();
    const followUpRequest = await followUpRequestPromise;
    await expect(historyToggle).toHaveAttribute("aria-disabled", "true");
    await expect(historyPanel).not.toHaveAttribute("open", "");
    expect(followUpRequest.postDataJSON()).toMatchObject({
      conversationId: "11111111111111111111111111111111",
      content: "Quelle région explique le plus cette baisse ?",
    });
    await expect(chat.getByText(/Produit Alpha mérite l’attention/)).toHaveCount(2);
    await expect(historyToggle).toHaveAttribute("aria-disabled", "false");

    await chat.getByRole("button", { name: "Démarrer une nouvelle conversation" }).click();
    await expect(chat.getByRole("heading", { name: "Interrogez les données autorisées" })).toBeVisible();
  });

  test("explique un refus de permission sans perdre la question", async ({ page }) => {
    await page.route("**/api/genie/fraim-sales/messages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "cache-control": "no-store" },
        body: [
          "event: error",
          "data: {\"type\":\"error\",\"code\":\"GENIE_PERMISSION_DENIED\",\"error\":\"Vous n’avez pas l’autorisation d’utiliser cet espace Genie ou ses données.\",\"requestId\":\"e2e-denied\",\"retryable\":false}",
          "",
          "",
        ].join("\n"),
      });
    });
    await page.goto("/genie");

    const embeddedSection = page.getByRole("region", {
      name: "Les KPI et la conversation, côte à côte",
    });
    const chat = embeddedSection.getByRole("region", {
      name: "Conversation Genie, space fraim-sales",
    });
    const composer = chat.getByRole("textbox", { name: "Question pour Genie" });
    await composer.fill("Montre les ventes auxquelles je peux accéder");
    await composer.press("Enter");

    const alert = chat.getByRole("alert");
    await expect(alert.getByText("Accès aux ressources Databricks requis", { exact: true })).toBeVisible();
    await expect(alert.getByText(/session et le consentement Databricks/)).toBeVisible();
    await expect(alert.getByText(/SQL warehouse/)).toBeVisible();
    await expect(alert.getByText(/Unity Catalog/)).toBeVisible();
    await expect(alert.getByText(/e2e-denied/)).toBeVisible();
    await expect(chat.getByLabel("Votre question").getByText("Montre les ventes auxquelles je peux accéder")).toBeVisible();
    await expect(chat.getByText("Réponse Genie prête", { exact: true })).toHaveCount(0);
  });

  for (const failure of ["pièce jointe manquante", "refus HTTP"] as const) {
    test(`verrouille une réponse après ${failure} sans rejouer la question`, async ({ page }) => {
      let submissions = 0;
      await page.route("**/api/genie/fraim-sales/messages", async (route) => {
        submissions++;
        if (failure === "refus HTTP") {
          await route.fulfill({ status: 403, contentType: "application/json",
            body: JSON.stringify({ error: { code: "GENIE_PERMISSION_DENIED", message: "Accès refusé.", requestId: "pre-stream" } }) });
          return;
        }
        await route.fulfill({ status: 200, contentType: "text/event-stream", body:
          `data: ${JSON.stringify({ type: "message_start", messageId: "m", conversationId: "c" })}\n\ndata: ${JSON.stringify({
          type: "message_result", message: {
            messageId: "m", conversationId: "c", status: "COMPLETED", content: "Question synthétique",
            attachments: [{ text: { content: "Réponse partielle : les lignes sont encore attendues." } },
              { attachmentId: "missing", query: { title: "Résultat interrompu", query: "SELECT synthetic" } }],
          },
        })}\n\n` });
      });
      await page.goto("/genie");
      const chat = page.getByRole("region", { name: "Les KPI et la conversation, côte à côte" })
        .getByRole("region", { name: "Conversation Genie, space fraim-sales" });
      const composer = chat.getByRole("textbox", { name: "Question pour Genie" });
      await composer.fill("Question interrompue");
      await composer.press("Enter");
      await expect(chat.getByRole("alert")).toBeVisible();
      await expect(chat.getByRole("textbox", { name: "Question pour Genie" })).toHaveCount(0);
      await expect(chat.getByText("Réponse Genie prête", { exact: true })).toHaveCount(0);
      await expect(chat.getByRole("button", { name: /Réessayer/ })).toHaveCount(0);
      if (failure === "refus HTTP") await expect(chat.getByText("Accès aux ressources Databricks requis", { exact: true })).toBeVisible();
      expect(submissions).toBe(1);
      await chat.getByRole("button", { name: "Démarrer une nouvelle conversation" }).click();
      await expect(chat.getByRole("textbox", { name: "Question pour Genie" })).toBeEnabled();
    });
  }

  test("reste utilisable sur mobile en thème sombre et mouvement réduit", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/genie");

    const darkThemeButton = page.getByRole("button", { name: "Thème sombre" });
    await darkThemeButton.click();
    await expect(darkThemeButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    const embeddedSection = page.getByRole("region", {
      name: "Les KPI et la conversation, côte à côte",
    });
    const chat = embeddedSection.getByRole("region", {
      name: "Conversation Genie, space fraim-sales",
    });
    const composer = chat.getByRole("textbox", { name: "Question pour Genie" });
    await composer.fill("Analyse mobile");
    await composer.press("Shift+Enter");
    await expect(composer).toHaveValue("Analyse mobile\n");
    await composer.press("Enter");
    await expect(chat.getByText(/Produit Alpha mérite l’attention/)).toBeVisible();

    const hasPageOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasPageOverflow).toBe(false);
  });
});
