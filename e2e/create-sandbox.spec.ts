import { test, expect } from "@playwright/test"

// End-to-end smoke test for the guest sandbox flow: Try the Sandbox, build the
// app demo, and confirm every resource card renders without a manual refresh.
// Hits the real backend and creates a real, short-lived guest sandbox.
// Needs either `npm run start:prod-api` running or launchpad-api port-forwarded
// to localhost:8080 (see playwright.config.ts).
test("building the app demo renders every card without a refresh", async ({ page }) => {
  await page.goto("/")

  await page.getByRole("button", { name: /Try the Sandbox/i }).click()

  await page.waitForURL(/\/workspaces\/guest-/, { timeout: 10_000 })

  await expect(page.getByText(/what do you want to try/i)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("button", { name: /App with real data/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  await page.getByRole("button", { name: /^Build it$/i }).click()

  // The regression this guards against: resources arrive server-side but the
  // page never renders them, leaving "No resources yet" until a hard refresh.
  // Assert every expected card shows up, and that a manual reload isn't
  // needed to see them. Matched against the card's .kind label specifically
  // (icon + label text, no whitespace separator in the DOM) rather than the
  // whole card's flattened text - "API" would otherwise also match
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
  // The picker coming back would invite a second build of everything.
  await expect(page.getByRole("button", { name: /^Build it$/i })).not.toBeVisible()
})
