import { describe, expect, it } from "vitest"
import { MAP_HEIGHT, MAP_WIDTH, project } from "./us-map"

describe("project", () => {
  it("places lower-48 cities inside the map, west to east", () => {
    const seattle = project(47.61, -122.33)!
    const austin = project(30.27, -97.74)!
    const boston = project(42.36, -71.06)!
    for (const p of [seattle, austin, boston]) {
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(MAP_WIDTH)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(MAP_HEIGHT)
    }
    expect(seattle.x).toBeLessThan(austin.x)
    expect(austin.x).toBeLessThan(boston.x)
    expect(seattle.y).toBeLessThan(austin.y)
  })

  it("drops places off the map", () => {
    expect(project(21.31, -157.86)).toBeNull()
    expect(project(61.22, -149.9)).toBeNull()
  })
})
