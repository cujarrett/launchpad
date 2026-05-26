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
  effect,
} from "@angular/core"
import {
  Resource,
  ResourceKind,
  ResourceStatus,
  RESOURCE_KIND_LABELS,
  RESOURCE_KIND_ICONS,
  RESOURCE_KIND_COLORS,
} from "../../core/models/workspace.model"

interface ArchEdge {
  from: string
  to: string
}
interface RenderedEdge {
  d: string
}

const COLUMNS: { label: string; kinds: ResourceKind[] }[] = [
  { label: "Frontend", kinds: ["XSpa"] },
  { label: "API", kinds: ["XApi"] },
  { label: "Messaging", kinds: ["XTopic", "XSubscription"] },
  { label: "Data", kinds: ["XSql", "XNoSql", "XObjectStorage"] },
]

@Component({
  selector: "app-workspace-arch",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="arch-wrap" #archWrap>
      @if (isCms()) {
        <div class="arch-cms">
          @for (node of cmsResources(); track node.name) {
            @let status = nodeStatus(node.name);
            <div
              class="arch-node arch-node--cms"
              [class.arch-node--synced]="status?.synced === true && status?.ready === true"
              [class.arch-node--unsynced]="status !== null && (!status.synced || !status.ready)"
              [style.--node-color]="kindColor(node.kind)"
            >
              <div class="arch-node-header">
                <span class="arch-node-icon">{{ kindIcon(node.kind) }}</span>
                <span class="arch-node-kind">{{ kindLabel(node.kind) }}</span>
                @if (status !== null) {
                  <span
                    class="arch-node-dot"
                    [class.arch-node-dot--ok]="status.synced && status.ready"
                    [class.arch-node-dot--warn]="!status.synced || !status.ready"
                  ></span>
                }
              </div>
              <span class="arch-node-name">{{ node.name }}</span>
              @if (node.spec["host"]) {
                <span class="arch-cms-host">{{ node.spec["host"] }}</span>
              }
              @if (status !== null) {
                <div class="arch-node-status">
                  <span
                    class="arch-node-status-pill arch-node-status-pill--{{
                      status.synced && status.ready ? 'ok' : 'warn'
                    }}"
                  >
                    {{ status.synced && status.ready ? "Ready" : status.message || "Not ready" }}
                  </span>
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <div class="arch-cols">
          @for (col of layout(); track col.label) {
            <div class="arch-col">
              <div class="arch-col-label">{{ col.label }}</div>
              <div class="arch-col-nodes">
                @for (node of col.nodes; track node.name) {
                  @let status = nodeStatus(node.name);
                  <div
                    class="arch-node arch-node--{{ kindSlug(node.kind) }}"
                    [class.arch-node--synced]="status?.synced === true && status?.ready === true"
                    [class.arch-node--unsynced]="
                      status !== null && (!status.synced || !status.ready)
                    "
                    [attr.data-arch-name]="node.name"
                    [style.--node-color]="kindColor(node.kind)"
                  >
                    <div class="arch-node-header">
                      <span class="arch-node-icon">{{ kindIcon(node.kind) }}</span>
                      <span class="arch-node-kind">{{ kindLabel(node.kind) }}</span>
                      @if (status !== null) {
                        <span
                          class="arch-node-dot"
                          [class.arch-node-dot--ok]="status.synced && status.ready"
                          [class.arch-node-dot--warn]="!status.synced || !status.ready"
                        ></span>
                      }
                    </div>
                    <span class="arch-node-name">{{ node.name }}</span>
                    @if (status !== null) {
                      <div class="arch-node-status">
                        <span
                          class="arch-node-status-pill arch-node-status-pill--{{
                            status.synced && status.ready ? 'ok' : 'warn'
                          }}"
                        >
                          {{
                            status.synced && status.ready ? "Ready" : status.message || "Not ready"
                          }}
                        </span>
                      </div>
                    }
                  </div>
                }
                @if (col.nodes.length === 0) {
                  <div class="arch-node arch-node--empty">—</div>
                }
              </div>
            </div>
          }
        </div>

        <svg
          class="arch-svg"
          #archSvg
          [attr.width]="svgW()"
          [attr.height]="svgH()"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="arch-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" class="arch-arrow-head" />
            </marker>
          </defs>
          @for (edge of renderedEdges(); track edge.d) {
            <path [attr.d]="edge.d" class="arch-edge" marker-end="url(#arch-arrow)" />
          }
        </svg>
      }
    </div>
  `,
})
export class WorkspaceArch {
  readonly resources = input.required<Resource[]>()
  readonly statusMap = input<Partial<Record<string, ResourceStatus>>>({})

  @ViewChild("archWrap") private wrapRef!: ElementRef<HTMLElement>
  @ViewChild("archSvg") private svgRef!: ElementRef<SVGElement>

  protected readonly renderedEdges = signal<RenderedEdge[]>([])
  protected readonly svgW = signal(0)
  protected readonly svgH = signal(0)

  protected readonly isCms = computed(() => this.resources().some((r) => r.kind === "XWordpress"))

  protected readonly cmsResources = computed(() =>
    this.resources().filter((r) => r.kind === "XWordpress"),
  )

  protected readonly layout = computed(() =>
    COLUMNS.map((col) => ({
      label: col.label,
      nodes: this.resources()
        .filter((r) => col.kinds.includes(r.kind))
        .map((r) => ({ name: r.name, kind: r.kind })),
    })),
  )

  private readonly edges = computed<ArchEdge[]>(() => {
    const resources = this.resources()
    const edges: ArchEdge[] = []
    const hasResource = (name: string) => resources.some((r) => r.name === name)

    for (const r of resources) {
      if (r.kind === "XApi") {
        for (const key of [
          "sqlRef",
          "nosqlRef",
          "objectStorageRef",
          "topicRef",
          "subscriptionRef",
        ]) {
          const ref = r.spec[key] as { name?: string } | undefined
          if (ref?.name && hasResource(ref.name)) {
            edges.push({ from: r.name, to: ref.name })
          }
        }
      }

      if (r.kind === "XSpa") {
        const proxy = r.spec["apiProxy"] as { enabled?: boolean; upstream?: string } | undefined
        if (proxy?.enabled) {
          const upstream = proxy.upstream ?? ""
          const apis = resources.filter((x) => x.kind === "XApi")
          const target =
            apis.find((a) => upstream.includes(a.name)) ?? (apis.length === 1 ? apis[0] : undefined)
          if (target) edges.push({ from: r.name, to: target.name })
        }
      }

      if (r.kind === "XSubscription") {
        const ref = r.spec["topicRef"] as { name?: string } | undefined
        if (ref?.name && hasResource(ref.name)) {
          edges.push({ from: r.name, to: ref.name })
        }
      }
    }

    return edges
  })

  constructor() {
    effect(() => {
      this.resources()
      this.edges()
      afterNextRender(() => this.draw())
    })
  }

  @HostListener("window:resize")
  protected onResize() {
    this.draw()
  }

  protected kindLabel(kind: ResourceKind): string {
    return RESOURCE_KIND_LABELS[kind] ?? kind
  }

  protected kindSlug(kind: ResourceKind): string {
    if (kind === "XSpa") return "spa"
    if (kind === "XApi") return "api"
    if (kind === "XTopic" || kind === "XSubscription") return "messaging"
    return "data"
  }

  protected kindColor(kind: ResourceKind): string {
    return RESOURCE_KIND_COLORS[kind] ?? "#888"
  }

  protected kindIcon(kind: ResourceKind): string {
    return RESOURCE_KIND_ICONS[kind] ?? ""
  }

  protected nodeStatus(name: string): ResourceStatus | null {
    return this.statusMap()[name] ?? null
  }

  private draw() {
    const wrap = this.wrapRef?.nativeElement
    const svg = this.svgRef?.nativeElement
    if (!wrap || !svg) return

    const containerRect = wrap.getBoundingClientRect()
    this.svgW.set(containerRect.width)
    this.svgH.set(containerRect.height)

    const positions = new Map<string, DOMRect>()
    wrap.querySelectorAll<HTMLElement>("[data-arch-name]").forEach((el) => {
      positions.set(el.dataset["archName"]!, el.getBoundingClientRect())
    })

    const rendered = this.edges().flatMap((edge) => {
      const from = positions.get(edge.from)
      const to = positions.get(edge.to)
      if (!from || !to) return []

      const x1 = from.right - containerRect.left
      const y1 = from.top + from.height / 2 - containerRect.top
      const x2 = to.left - containerRect.left
      const y2 = to.top + to.height / 2 - containerRect.top

      // Intra-column edges (same x range): arc above the column
      if (Math.abs(x1 - x2) < 40) {
        const mx = x1 - 40
        const my = (y1 + y2) / 2
        return [{ d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` }]
      }

      const dx = (x2 - x1) * 0.45
      return [{ d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` }]
    })

    this.renderedEdges.set(rendered)
  }
}
