import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    locale: "fr-FR",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: process.env.E2E_PRODUCTION === "1" ? "npm run start" : "npm run dev",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_MODE: "demo",
      PORT: String(port),
      APP_HOST: "127.0.0.1",
      USER_STATE_ENABLED: process.env.E2E_PRODUCTION === "1" ? "false" : "true",
      USER_STATE_ORIGIN: baseURL,
      APP_NAME: "Assistant analytics",
      APP_DESCRIPTION: "Démonstration locale de l’assistant Genie",
      APP_SUPPORT_NAME: "Équipe Analytics",
      APP_SUPPORT_SLACK_URL: "https://valiuz.slack.com/team/U01C3FT98HE",
    },
  },
});
