import { defineConfig, devices } from "@playwright/test";

// Parcours de bout en bout (plan T16). Prérequis : Supabase local démarré (npx supabase start,
// Mailpit compris) ; l'application est lancée automatiquement si elle ne tourne pas.
export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
