import { defineConfig } from "@playwright/test"

// Runs against the real launchpad-api backend — not a mock. Before running,
// port-forward the cluster service so the dev server's proxy has something to
// talk to:
//   kubectl port-forward -n launchpad svc/launchpad-api 8080:80
//
// Uses the `chrome` channel (your installed Google Chrome) instead of a
// Playwright-managed Chromium download.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4200",
    channel: "chrome",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm start",
    url: "http://localhost:4200",
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
