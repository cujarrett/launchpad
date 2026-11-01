import { Component, computed, effect, inject, input, signal } from "@angular/core"
import { WorkspaceService } from "../../core/services/workspace.service"
import { Resource, ResourceStatus, statusKey } from "../../core/models/workspace.model"

interface Group {
  title: string
  kinds: string[]
}

// Plain-word groups for what the platform makes. A kind not listed lands in "Other parts".
const GROUPS: Group[] = [
  {
    title: "Who it is",
    kinds: ["Application", "Principal", "FederatedIdentityCredential", "ServiceAccount"],
  },
  {
    title: "What it may use",
    kinds: ["TemporalNamespace", "AppRole", "RoleAssignment", "Role", "RolePolicyAttachment"],
  },
  {
    title: "Who may call it",
    kinds: [
      "PeerAuthentication",
      "AuthorizationPolicy",
      "Sidecar",
      "ServiceEntry",
      "NetworkPolicy",
    ],
  },
  {
    title: "How it runs",
    kinds: ["Deployment", "StatefulSet", "Service", "HTTPRoute", "Middleware", "ConfigMap"],
  },
  { title: "How we watch it", kinds: ["ServiceMonitor", "PodMonitor"] },
]

interface Row {
  title: string
  kinds: string[]
  ready: boolean
}

interface Cleanup {
  workflowId: string
  namespace: string
  status: string
}

@Component({
  selector: "app-platform-made",
  template: `
    @if (total() > 0) {
      <div class="panel">
        <p class="headline">
          {{ files() }} {{ files() === 1 ? "file" : "files" }} in Git.
          <strong>{{ total() }} things the platform made.</strong>
        </p>
        <ul>
          @for (row of rows(); track row.title) {
            <li [class.ready]="row.ready">
              <span class="dot"></span>
              <span class="title">{{ row.title }}</span>
              <span class="kinds">{{ row.kinds.join(", ") }}</span>
            </li>
          }
          @if (cleanup(); as c) {
            <li [class.ready]="c.status === 'running'">
              <span class="dot"></span>
              <span class="title">Cleanup</span>
              <span class="kinds"> Temporal workflow {{ c.workflowId }}, {{ c.status }} </span>
            </li>
          }
        </ul>
      </div>
    }
  `,
  styles: [
    `
      .panel {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 0.75rem 1.25rem;
        margin-top: 1.5rem;
      }
      .headline {
        margin: 0 0 0.5rem;
        font-size: 0.9rem;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        display: grid;
        grid-template-columns: 0.75rem 9rem 1fr;
        gap: 0.5rem;
        align-items: baseline;
        padding: 0.3rem 0;
        font-size: 0.85rem;
      }
      .dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.25);
      }
      li.ready .dot {
        background: #4ade80;
      }
      .kinds {
        opacity: 0.6;
        font-size: 0.75rem;
      }
      @media (max-width: 600px) {
        li {
          grid-template-columns: 0.75rem 1fr;
        }
        .kinds {
          grid-column: 2;
        }
      }
    `,
  ],
})
export class PlatformMade {
  readonly workspace = input.required<string>()
  readonly resources = input.required<Resource[]>()
  readonly statusMap = input.required<Partial<Record<string, ResourceStatus>>>()
  readonly isGuest = input(false)

  private readonly workspaceService = inject(WorkspaceService)
  protected readonly cleanup = signal<Cleanup | null>(null)

  protected readonly files = computed(() => this.resources().length)

  private readonly statuses = computed(() =>
    this.resources()
      .map((r) => this.statusMap()[statusKey(r.kind, r.name)])
      .filter((s): s is ResourceStatus => !!s),
  )

  protected readonly total = computed(() =>
    this.statuses().reduce((n, s) => n + (s.composed?.length ?? 0), 0),
  )

  // A group is ready once every XR that made something in it is Ready.
  protected readonly rows = computed<Row[]>(() => {
    const known = new Set(GROUPS.flatMap((g) => g.kinds))
    const groups = [...GROUPS, { title: "Other parts", kinds: [] as string[] }]
    return groups
      .map((g) => {
        const kinds = new Set<string>()
        let ready = true
        for (const s of this.statuses()) {
          const mine = (s.composed ?? []).filter((k) =>
            g.kinds.length ? g.kinds.includes(k) : !known.has(k),
          )
          mine.forEach((k) => kinds.add(k))
          if (mine.length && !s.ready) ready = false
        }
        return { title: g.title, kinds: [...kinds].sort(), ready }
      })
      .filter((r) => r.kinds.length > 0)
  })

  constructor() {
    // The cleanup workflow starts with the sandbox, so one read is enough.
    effect(() => {
      if (!this.isGuest()) return
      this.workspaceService.getGuestCleanup(this.workspace()).subscribe({
        next: (c) => this.cleanup.set(c),
        error: () => this.cleanup.set(null),
      })
    })
  }
}
