import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

// Surface VITE_* vars from .env / .env.local to the test process so specs can
// decide whether Supabase-backed tests should run (see e2e/README.md). The dev
// server reads the same files itself.
const viteEnv = loadEnv("development", process.cwd(), "VITE_");
for (const [key, value] of Object.entries(viteEnv)) {
  process.env[key] ??= value;
}

// A dedicated port (not Vite's default 5173) so a dev server from another
// checkout/worktree is never silently reused.
const PORT = Number(process.env.E2E_PORT ?? 5287);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
