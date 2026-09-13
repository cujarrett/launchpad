import { describe, it, expect } from "vitest"
import { summariseEntry } from "./dynamic-form"

// Shapes taken from real XRs in homelab-workspaces - these are what the field
// actually receives, not invented examples.
describe("summariseEntry", () => {
  it("renders an apiProxies entry as path → upstream", () => {
    expect(
      summariseEntry({
        path: "/authorized/",
        upstream: "authorized-api.platform-connections-demo.svc.cluster.local",
      }),
    ).toEqual({
      main: "/authorized/ → authorized-api.platform-connections-demo.svc.cluster.local",
      detail: "",
    })
  })

  it("renders an off-platform consumes entry with its host", () => {
    expect(summariseEntry({ host: "api.open-meteo.com" })).toEqual({
      main: "api.open-meteo.com",
      detail: "",
    })
  })

  it("includes port and protocol when the consumes entry sets them", () => {
    expect(
      summariseEntry({ host: "s3.us-east-1.amazonaws.com", port: 443, protocol: "TLS" }),
    ).toEqual({ main: "s3.us-east-1.amazonaws.com:443", detail: "TLS" })
  })

  it("renders an on-platform consumes entry as app in namespace", () => {
    expect(summariseEntry({ namespace: "platform-connections-demo", app: "upstream-api" })).toEqual(
      { main: "upstream-api", detail: "in platform-connections-demo" },
    )
  })

  it("renders a provides entry with its auth and the callers granted it", () => {
    expect(
      summariseEntry({
        name: "Data.Read",
        auth: "workload",
        allowedCallers: [{ namespace: "platform-connections-demo", app: "authorized-api" }],
      }),
    ).toEqual({
      main: "Data.Read",
      detail: "workload · granted to authorized-api in platform-connections-demo",
    })
  })

  // The whole point of the fix: never surface "[object Object]", even for a
  // shape no XRD defines yet.
  it("falls back to key: value for an unrecognised shape", () => {
    const out = summariseEntry({ somethingNew: "x", nested: { a: 1 } })
    expect(out.main).toBe('somethingNew: x, nested: {"a":1}')
    expect(out.main).not.toContain("[object Object]")
  })

  it("does not throw on a null entry", () => {
    expect(summariseEntry(null)).toEqual({ main: "null", detail: "" })
  })
})
