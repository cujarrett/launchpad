import { describe, expect, it } from "vitest"
import { waitLine } from "./wait-lines"

describe("waitLine", () => {
  it("stays quiet for a normal wait", () => {
    expect(waitLine("Entra", 8_000)).toBeNull()
  })

  it("nudges whoever is slow, then starts with their own jokes", () => {
    expect(waitLine("Entra", 12_000)).toBe("Entra's taking its time. We're asking nicely.")
    expect(waitLine("AWS", 21_000)).toContain("AWS")
  })
})
