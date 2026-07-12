import { test, expect } from "@playwright/test"

// End-to-end smoke test for the guest sandbox creation flow: launch a
// workspace, add an XApi with every add-on (SQL, NoSQL, object storage,
// cache, SPA), and confirm the resource cards render without needing a
// manual refresh. Requires launchpad-api port-forwarded to localhost:8080
// (see playwright.config.ts) — this hits the real backend and creates a
// real, short-lived guest sandbox.
test("creating a fully-loaded sandbox renders cards without a refresh", async ({ page }) => {
  await page.goto("/")

  await page.getByText(/Try the Sandbox/i).click()
  await page.getByRole("button", { name: /^Launch!?$/i }).click()

  await page.waitForURL(/\/workspaces\/guest-/, { timeout: 10_000 })

  await expect(page.getByText(/what do you want to build/i)).toBeVisible({ timeout: 15_000 })

  await page.locator(".kind-card", { hasText: /API/i }).first().click()

  const addOns = ["SQL database", "NoSQL database", "object storage", "Add cache", "create a SPA"]
  for (const label of addOns) {
    const option = page.locator(".option-card", { hasText: new RegExp(label, "i") }).first()
    if (await option.count()) await option.click()
  }

  await page.getByRole("button", { name: /^Create$/i }).click()

  // The regression this guards against: resources arrive server-side but the
  // page never renders them, leaving "No resources yet" until a hard refresh.
  // Assert every expected card shows up, and that a manual reload isn't
  // needed to see them. Matched against the card's .kind label specifically
  // (icon + label text, no whitespace separator in the DOM) rather than the
  // whole card's flattened text — "API" would otherwise also match
  // "APIfuzzy-tornado-api", and "SQL Database" is itself a suffix of
  // "NoSQL Database" so needs an explicit exclusion, not just an end anchor.
  const kindPatterns: Record<string, RegExp> = {
    SPA: /SPA$/,
    API: /API$/,
    "NoSQL Database": /NoSQL Database$/,
    "SQL Database": /(?<!No)SQL Database$/,
    "Object Storage": /Object Storage$/,
  }
  for (const [label, pattern] of Object.entries(kindPatterns)) {
    await expect(page.locator(".resource-card .kind").filter({ hasText: pattern })).toBeVisible({
      timeout: 30_000,
    })
  }

  await expect(page.getByText(/no resources yet/i)).not.toBeVisible()
})
