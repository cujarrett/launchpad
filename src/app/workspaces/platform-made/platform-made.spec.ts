import { describe, expect, it } from "vitest"
import { waitingGroups } from "./platform-made"

describe("waitingGroups", () => {
  it("maps each waiting part to its row", () => {
    expect(waitingGroups("Unready resources: deployment")).toEqual(new Set(["runs"]))
    expect(waitingGroups("Unready resources: deployment and temporal-role")).toEqual(
      new Set(["runs", "use"]),
    )
    expect(
      waitingGroups("Unready resources: connection-authz, entra-principal, and servicemonitor"),
    ).toEqual(new Set(["callers", "who", "watch"]))
  })

  it("says nothing when the message leaves parts out or names an unknown one", () => {
    expect(waitingGroups("Unready resources: a, b, c, and 2 more")).toBeNull()
    expect(waitingGroups("Unready resources: role-sql-foo")).toBeNull()
    expect(waitingGroups("")).toBeNull()
    expect(waitingGroups(undefined)).toBeNull()
  })
})
