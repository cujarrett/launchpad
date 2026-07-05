import { TestBed } from "@angular/core/testing"
import { WorkspaceArch } from "./workspace-arch"
import { Resource, ResourceStatus } from "../../core/models/workspace.model"

// jsdom has no layout engine — give the wrap element a real width so the
// component can compute the diagram geometry.
const origGetBoundingClientRect = Element.prototype.getBoundingClientRect

// Mirrors what a guest demo workspace provisions with every toggle on.
const guestResources: Resource[] = [
  {
    name: "magic-pretzel-spa",
    kind: "XSpa",
    namespace: "guest-magic-pretzel",
    spec: { host: "demo1.mattjarrett.dev" },
  },
  {
    name: "magic-pretzel-api",
    kind: "XApi",
    namespace: "guest-magic-pretzel",
    spec: {
      host: "demo1-api.mattjarrett.dev",
      sqlRef: { name: "magic-pretzel-sql" },
      nosqlRef: { name: "magic-pretzel-nosql" },
      objectStorageRefs: [{ name: "magic-pretzel-store" }],
      cache: { enabled: true },
    },
  },
  { name: "magic-pretzel-sql", kind: "XSql", namespace: "guest-magic-pretzel", spec: {} },
  { name: "magic-pretzel-nosql", kind: "XNoSql", namespace: "guest-magic-pretzel", spec: {} },
  {
    name: "magic-pretzel-store",
    kind: "XObjectStorage",
    namespace: "guest-magic-pretzel",
    spec: {},
  },
]

const readyStatus = (name: string): ResourceStatus => ({
  workspace: "guest-magic-pretzel",
  kind: "X",
  name,
  synced: true,
  ready: true,
})

function mount(resources: Resource[], statusMap: Record<string, ResourceStatus> = {}) {
  const fixture = TestBed.createComponent(WorkspaceArch)
  fixture.componentRef.setInput("resources", resources)
  fixture.componentRef.setInput("statusMap", statusMap)
  fixture.detectChanges()
  return fixture
}

describe("WorkspaceArch", () => {
  beforeEach(async () => {
    Element.prototype.getBoundingClientRect = function () {
      return {
        width: 1200,
        height: 0,
        top: 0,
        left: 0,
        right: 1200,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }
    }
    await TestBed.configureTestingModule({ imports: [WorkspaceArch] }).compileComponents()
  })

  afterEach(() => {
    Element.prototype.getBoundingClientRect = origGetBoundingClientRect
  })

  it("renders a node per resource plus users and derived cache", async () => {
    const fixture = mount(guestResources)
    await fixture.whenStable()
    fixture.detectChanges()

    const el: HTMLElement = fixture.nativeElement
    const nodeNames = [...el.querySelectorAll(".arch-node-name")].map((n) => n.textContent?.trim())
    expect(nodeNames).toContain("users")
    expect(nodeNames).toContain("magic-pretzel-spa")
    expect(nodeNames).toContain("magic-pretzel-api")
    expect(nodeNames).toContain("magic-pretzel-sql")
    expect(nodeNames).toContain("magic-pretzel-nosql")
    expect(nodeNames).toContain("magic-pretzel-store")
    expect(nodeNames).toContain("magic-pretzel-api-cache")
  })

  it("draws https, rest, and service-binding edges for a guest workspace", async () => {
    const fixture = mount(guestResources)
    await fixture.whenStable()
    fixture.detectChanges()

    const el: HTMLElement = fixture.nativeElement
    const labels = [...el.querySelectorAll(".arch-edge-label")].map((n) => n.textContent?.trim())
    expect(labels).toContain("https") // users → spa
    expect(labels).toContain("rest") // spa → api (no apiProxy on guest SPAs)
    expect(labels).toContain("sql")
    expect(labels).toContain("nosql")
    expect(labels).toContain("objects")
    expect(labels).toContain("cache")
  })

  it("animates flow particles only when both endpoints are ready", async () => {
    const noneReady = mount(guestResources)
    await noneReady.whenStable()
    noneReady.detectChanges()
    expect(noneReady.nativeElement.querySelectorAll(".arch-particle").length).toBe(0)

    const allReady = mount(
      guestResources,
      Object.fromEntries(guestResources.map((r) => [r.name, readyStatus(r.name)])),
    )
    await allReady.whenStable()
    allReady.detectChanges()
    expect(allReady.nativeElement.querySelectorAll(".arch-particle").length).toBeGreaterThan(0)
  })

  it("renders WordPress with a derived MariaDB node", async () => {
    const fixture = mount([
      {
        name: "foo",
        kind: "XWordpress",
        namespace: "foo",
        spec: { host: "foo.example.com" },
      },
    ])
    await fixture.whenStable()
    fixture.detectChanges()

    const el: HTMLElement = fixture.nativeElement
    const nodeNames = [...el.querySelectorAll(".arch-node-name")].map((n) => n.textContent?.trim())
    expect(nodeNames).toContain("users")
    expect(nodeNames).toContain("foo")
    expect(nodeNames).toContain("foo-db")
    const labels = [...el.querySelectorAll(".arch-edge-label")].map((n) => n.textContent?.trim())
    expect(labels).toContain("https")
    expect(labels).toContain("sql")
  })

  it("omits the internet users node when all hosts are internal", async () => {
    // Mirrors the sump-pump workspace: IoT APIs on .local.lab plus messaging.
    const fixture = mount([
      {
        name: "foo-bridge",
        kind: "XApi",
        namespace: "foo",
        spec: { host: "foo-bridge.local.lab", topicRef: { name: "foo-events" } },
      },
      {
        name: "foo-consumer",
        kind: "XApi",
        namespace: "foo",
        spec: { subscriptionRef: { name: "foo-monitor" } },
      },
      { name: "foo-events", kind: "XTopic", namespace: "foo", spec: {} },
      {
        name: "foo-monitor",
        kind: "XSubscription",
        namespace: "foo",
        spec: { topicRef: { name: "foo-events" } },
      },
    ])
    await fixture.whenStable()
    fixture.detectChanges()

    const el: HTMLElement = fixture.nativeElement
    const nodeNames = [...el.querySelectorAll(".arch-node-name")].map((n) => n.textContent?.trim())
    expect(nodeNames).not.toContain("users")
    const labels = [...el.querySelectorAll(".arch-edge-label")].map((n) => n.textContent?.trim())
    expect(labels).not.toContain("https")
    expect(labels).toContain("publish")
    expect(labels).toContain("stream")
    expect(labels).toContain("consume")
  })

  it("shows the empty state when there are no resources", () => {
    const fixture = mount([])
    expect(fixture.nativeElement.textContent).toContain("No resources yet.")
  })
})
