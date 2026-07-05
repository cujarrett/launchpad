import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  input,
  signal,
  ViewChild,
} from "@angular/core"
import {
  Resource,
  ResourceKind,
  ResourceStatus,
  RESOURCE_KIND_LABELS,
  RESOURCE_KIND_ICONS,
  RESOURCE_KIND_COLORS,
} from "../../core/models/workspace.model"

// Fixed geometry — layout is computed from data, never measured from the DOM.
const NODE_W = 176
const NODE_H = 84
const ROW_GAP = 32
const MIN_COL_GAP = 46
const MAX_COL_GAP = 170
const PAD_X = 12
const PAD_TOP = 16
const PAD_BOTTOM = 16

interface DiagramNode {
  id: string
  label: string
  kindLabel: string
  icon: string
  color: string
  host?: string
  // Resource name whose SSE status this node reflects. Derived nodes (cache,
  // MariaDB) inherit their parent resource's status. Null = no status (users).
  statusName: string | null
  isUser?: boolean
}

interface DiagramEdge {
  from: string
  to: string
  label: string
}

interface DiagramColumn {
  nodes: DiagramNode[]
}

interface PlacedNode extends DiagramNode {
  x: number
  y: number
}

interface PlacedEdge {
  id: string
  from: string
  to: string
  label: string
  d: string
  labelX: number
  labelY: number
}

interface Layout {
  width: number
  height: number
  nodes: PlacedNode[]
  edges: PlacedEdge[]
}

const USER_NODE_ID = "__users__"

@Component({
  selector: "app-workspace-arch",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="arch-wrap" #archWrap>
      @if (layout(); as l) {
        <div class="arch-canvas" [style.width.px]="l.width" [style.height.px]="l.height">
          <svg class="arch-svg" [attr.width]="l.width" [attr.height]="l.height" aria-hidden="true">
            <defs>
              <marker
                id="arch-arrow-ok"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" class="arch-arrow-head arch-arrow-head--ok" />
              </marker>
              <marker
                id="arch-arrow-warn"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" class="arch-arrow-head arch-arrow-head--warn" />
              </marker>
            </defs>
            @for (edge of l.edges; track edge.id) {
              @let ok = edgeOk(edge);
              <g
                class="arch-edge-g"
                [class.arch-edge-g--ok]="ok"
                [class.arch-edge-g--warn]="!ok"
                [class.arch-edge-g--dim]="isEdgeDimmed(edge)"
              >
                <path
                  [attr.id]="edge.id"
                  [attr.d]="edge.d"
                  class="arch-edge"
                  [attr.marker-end]="ok ? 'url(#arch-arrow-ok)' : 'url(#arch-arrow-warn)'"
                />
                <text [attr.x]="edge.labelX" [attr.y]="edge.labelY" class="arch-edge-label">
                  {{ edge.label }}
                </text>
                @if (ok) {
                  <circle r="2.5" class="arch-particle">
                    <animateMotion dur="2.4s" repeatCount="indefinite">
                      <mpath [attr.href]="'#' + edge.id" />
                    </animateMotion>
                  </circle>
                  <circle r="2.5" class="arch-particle">
                    <animateMotion dur="2.4s" begin="-1.2s" repeatCount="indefinite">
                      <mpath [attr.href]="'#' + edge.id" />
                    </animateMotion>
                  </circle>
                }
              </g>
            }
          </svg>

          @for (node of l.nodes; track node.id) {
            @let status = nodeStatus(node);
            @let ok = status !== null && status.synced && status.ready;
            <div
              class="arch-node"
              [class.arch-node--user]="node.isUser"
              [class.arch-node--ok]="ok"
              [class.arch-node--warn]="status !== null && !ok"
              [class.arch-node--dim]="isNodeDimmed(node.id)"
              [style.left.px]="node.x"
              [style.top.px]="node.y"
              [style.--node-color]="node.color"
              (mouseenter)="hovered.set(node.id)"
              (mouseleave)="hovered.set(null)"
            >
              <div class="arch-node-top">
                <span class="arch-node-icon">{{ node.icon }}</span>
                <span class="arch-node-kind">{{ node.kindLabel }}</span>
                @if (status !== null) {
                  <span
                    class="arch-node-dot"
                    [class.arch-node-dot--ok]="ok"
                    [class.arch-node-dot--warn]="!ok"
                  ></span>
                }
              </div>
              <div class="arch-node-name">{{ node.label }}</div>
              <div class="arch-node-bottom">
                @if (status !== null) {
                  <span class="arch-node-pill" [class.arch-node-pill--ok]="ok">
                    {{ ok ? "Ready" : status.message || "Not ready" }}
                  </span>
                }
                @if (node.host) {
                  <span class="arch-node-host">{{ node.host }}</span>
                }
              </div>
            </div>
          }
        </div>

        <div class="arch-legend">
          <span class="arch-legend-summary">
            {{ resources().length }} resource{{ resources().length === 1 ? "" : "s" }} ·
            {{ readyCount() }} ready
          </span>
          <span class="arch-legend-item">
            <span class="arch-legend-dot arch-legend-dot--ok"></span> Ready
          </span>
          <span class="arch-legend-item">
            <span class="arch-legend-dot arch-legend-dot--warn"></span> Provisioning
          </span>
          <span class="arch-legend-item"
            ><span class="arch-legend-flow"></span> Live data flow</span
          >
        </div>
      } @else {
        <p class="muted">No resources yet.</p>
      }
    </div>
  `,
})
export class WorkspaceArch {
  readonly resources = input.required<Resource[]>()
  readonly statusMap = input<Partial<Record<string, ResourceStatus>>>({})

  @ViewChild("archWrap", { static: true }) private wrapRef!: ElementRef<HTMLElement>

  protected readonly hovered = signal<string | null>(null)
  private readonly containerW = signal(0)

  constructor() {
    afterNextRender(() => this.measure())
  }

  @HostListener("window:resize")
  protected onResize() {
    this.measure()
  }

  private measure() {
    this.containerW.set(this.wrapRef.nativeElement.getBoundingClientRect().width)
  }

  protected readonly readyCount = computed(() => {
    const statusMap = this.statusMap()
    return this.resources().filter((r) => {
      const s = statusMap[r.name]
      return s?.synced && s?.ready
    }).length
  })

  // ── Graph: columns + edges derived purely from resource specs ──

  private readonly graph = computed<{ columns: DiagramColumn[]; edges: DiagramEdge[] }>(() => {
    const resources = this.resources()
    const byKind = (...kinds: ResourceKind[]) => resources.filter((r) => kinds.includes(r.kind))

    const toNode = (r: Resource): DiagramNode => ({
      id: r.name,
      label: r.name,
      kindLabel: RESOURCE_KIND_LABELS[r.kind] ?? r.kind,
      icon: RESOURCE_KIND_ICONS[r.kind] ?? "",
      color: RESOURCE_KIND_COLORS[r.kind] ?? "#888",
      host: typeof r.spec["host"] === "string" ? (r.spec["host"] as string) : undefined,
      statusName: r.name,
    })

    const frontend = byKind("XSpa", "XWordpress").map(toNode)
    const apis = byKind("XApi").map(toNode)
    // Topics before subscriptions so publish→deliver→consume reads top-down.
    const messaging = [...byKind("XTopic"), ...byKind("XSubscription")].map(toNode)
    const data = byKind("XSql", "XNoSql", "XObjectStorage", "XCache").map(toNode)

    const edges: DiagramEdge[] = []
    const nodeIds = new Set([...frontend, ...apis, ...messaging, ...data].map((n) => n.id))
    const addEdge = (from: string, to: string, label: string) => {
      if (nodeIds.has(from) && nodeIds.has(to)) edges.push({ from, to, label })
    }

    // Derived nodes: an XApi's embedded cache and a WordPress's MariaDB are
    // real running components with no resource file of their own.
    for (const r of byKind("XApi")) {
      const cache = r.spec["cache"] as { enabled?: boolean } | undefined
      if (cache?.enabled) {
        const id = `${r.name}-cache`
        data.push({
          id,
          label: id,
          kindLabel: RESOURCE_KIND_LABELS["XCache"],
          icon: RESOURCE_KIND_ICONS["XCache"],
          color: RESOURCE_KIND_COLORS["XCache"],
          statusName: r.name,
        })
        nodeIds.add(id)
        addEdge(r.name, id, "cache")
      }
    }
    for (const r of byKind("XWordpress")) {
      const id = `${r.name}-db`
      data.push({
        id,
        label: id,
        kindLabel: "MariaDB",
        icon: RESOURCE_KIND_ICONS["XSql"],
        color: RESOURCE_KIND_COLORS["XSql"],
        statusName: r.name,
      })
      nodeIds.add(id)
      addEdge(r.name, id, "sql")
    }

    // Entry point: browsers reach whichever tier has a public host.
    // Internal .local.lab hosts are LAN-only — no internet users.
    const isPublicHost = (r: Resource) => {
      const host = r.spec["host"]
      return typeof host === "string" && host !== "" && !host.endsWith(".local.lab")
    }
    const users: DiagramNode[] = []
    const publicFrontends = byKind("XSpa", "XWordpress").filter(isPublicHost)
    const publicApis = byKind("XApi").filter(isPublicHost)
    if (publicFrontends.length > 0 || publicApis.length > 0) {
      users.push({
        id: USER_NODE_ID,
        label: "users",
        kindLabel: "Internet",
        icon: "🌍",
        color: "#8492a6",
        statusName: null,
        isUser: true,
      })
      nodeIds.add(USER_NODE_ID)
      for (const r of publicFrontends) addEdge(USER_NODE_ID, r.name, "https")
      if (publicFrontends.length === 0) {
        for (const r of publicApis) addEdge(USER_NODE_ID, r.name, "https")
      }
    }

    // SPA → API: explicit proxy wins; otherwise a lone SPA+API pair is
    // assumed to talk to each other (guest workspaces set no apiProxy).
    const apiResources = byKind("XApi")
    for (const r of byKind("XSpa")) {
      const proxy = r.spec["apiProxy"] as { enabled?: boolean; upstream?: string } | undefined
      const upstream = proxy?.upstream ?? ""
      const target = proxy?.enabled
        ? (apiResources.find((a) => upstream.includes(a.name)) ??
          (apiResources.length === 1 ? apiResources[0] : undefined))
        : apiResources.length === 1
          ? apiResources[0]
          : undefined
      if (target) addEdge(r.name, target.name, proxy?.enabled ? "/api" : "rest")
    }

    // API service bindings.
    for (const r of apiResources) {
      const ref = (key: string) => (r.spec[key] as { name?: string } | undefined)?.name
      const sql = ref("sqlRef")
      if (sql) addEdge(r.name, sql, "sql")
      const nosql = ref("nosqlRef")
      if (nosql) addEdge(r.name, nosql, "nosql")
      const stores = r.spec["objectStorageRefs"] as { name?: string }[] | undefined
      for (const s of stores ?? []) {
        if (s.name) addEdge(r.name, s.name, "objects")
      }
      const topic = ref("topicRef")
      if (topic) addEdge(r.name, topic, "publish")
      const sub = ref("subscriptionRef")
      if (sub) addEdge(sub, r.name, "consume")
    }

    // Subscription ← Topic delivery.
    for (const r of byKind("XSubscription")) {
      const topic = (r.spec["topicRef"] as { name?: string } | undefined)?.name
      if (topic) addEdge(topic, r.name, "stream")
    }

    // Column order: internet → frontend → api → messaging → data.
    const columns: DiagramColumn[] = [
      { nodes: users },
      { nodes: frontend },
      { nodes: apis },
      { nodes: messaging },
      { nodes: data },
    ].filter((c) => c.nodes.length > 0)

    return { columns, edges }
  })

  // ── Layout: fixed-size nodes on a computed grid, edges as beziers ──

  protected readonly layout = computed<Layout | null>(() => {
    const { columns, edges } = this.graph()
    const containerW = this.containerW()
    if (columns.length === 0 || containerW === 0) return null

    const n = columns.length
    const spread = n > 1 ? (containerW - 2 * PAD_X - n * NODE_W) / (n - 1) : 0
    const colGap = Math.max(MIN_COL_GAP, Math.min(MAX_COL_GAP, spread))
    const totalW = 2 * PAD_X + n * NODE_W + (n - 1) * colGap
    const offsetX = Math.max(0, (containerW - totalW) / 2)

    const colHeights = columns.map((c) => c.nodes.length * NODE_H + (c.nodes.length - 1) * ROW_GAP)
    const maxColH = Math.max(...colHeights)
    const height = PAD_TOP + maxColH + PAD_BOTTOM

    const nodes: PlacedNode[] = []
    const colOf = new Map<string, number>()

    columns.forEach((col, ci) => {
      const x = offsetX + PAD_X + ci * (NODE_W + colGap)
      const yStart = PAD_TOP + (maxColH - colHeights[ci]) / 2
      col.nodes.forEach((node, ri) => {
        colOf.set(node.id, ci)
        nodes.push({ ...node, x, y: yStart + ri * (NODE_H + ROW_GAP) })
      })
    })

    const pos = new Map(nodes.map((node) => [node.id, node]))
    const placedEdges: PlacedEdge[] = []
    edges.forEach((edge, i) => {
      const from = pos.get(edge.from)
      const to = pos.get(edge.to)
      if (!from || !to) return

      let d: string
      let labelX: number
      let labelY: number

      if (colOf.get(edge.from) === colOf.get(edge.to)) {
        // Same column (topic → subscription): connect vertically.
        const upper = from.y < to.y ? from : to
        const lower = from.y < to.y ? to : from
        const x = upper.x + NODE_W / 2
        const y1 = from === upper ? upper.y + NODE_H : lower.y
        const y2 = from === upper ? lower.y : upper.y + NODE_H
        d = `M${x},${y1} L${x},${y2}`
        labelX = x + 8
        labelY = (y1 + y2) / 2 + 3
      } else {
        const leftToRight = from.x < to.x
        const x1 = leftToRight ? from.x + NODE_W : from.x
        const x2 = leftToRight ? to.x : to.x + NODE_W
        const y1 = from.y + NODE_H / 2
        const y2 = to.y + NODE_H / 2
        const dx = (x2 - x1) * 0.5
        d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
        labelX = (x1 + x2) / 2
        labelY = (y1 + y2) / 2 - 7
      }

      placedEdges.push({
        id: `arch-e${i}`,
        from: edge.from,
        to: edge.to,
        label: edge.label,
        d,
        labelX,
        labelY,
      })
    })

    return { width: Math.max(containerW, totalW), height, nodes, edges: placedEdges }
  })

  // ── Health + hover state ──

  protected nodeStatus(node: DiagramNode): ResourceStatus | null {
    if (!node.statusName) return null
    return this.statusMap()[node.statusName] ?? null
  }

  private idOk(id: string): boolean {
    if (id === USER_NODE_ID) return true
    const layout = this.layout()
    const node = layout?.nodes.find((n) => n.id === id)
    if (!node?.statusName) return false
    const s = this.statusMap()[node.statusName]
    return s?.synced === true && s?.ready === true
  }

  protected edgeOk(edge: PlacedEdge): boolean {
    return this.idOk(edge.from) && this.idOk(edge.to)
  }

  protected isEdgeDimmed(edge: PlacedEdge): boolean {
    const hovered = this.hovered()
    return hovered !== null && edge.from !== hovered && edge.to !== hovered
  }

  protected isNodeDimmed(id: string): boolean {
    const hovered = this.hovered()
    if (hovered === null || hovered === id) return false
    const edges = this.layout()?.edges ?? []
    return !edges.some(
      (e) => (e.from === hovered && e.to === id) || (e.to === hovered && e.from === id),
    )
  }
}
