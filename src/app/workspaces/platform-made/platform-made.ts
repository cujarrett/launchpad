import { Component, computed, effect, inject, input, signal } from "@angular/core"
import { WorkspaceService } from "../../core/services/workspace.service"
import { techParts } from "../../core/tech-text"
import {
  RESOURCE_KIND_LABELS,
  Resource,
  ResourceStatus,
  statusKey,
} from "../../core/models/workspace.model"

interface Row {
  title: string
  text: string
  // The resource kinds behind the line, shown on hover.
  kinds: string[]
  ready: boolean
}

// A kind not listed in any group lands in "Other parts".
const GROUP_KINDS: Record<string, string[]> = {
  data: ["AWS Table", "AWS Bucket", "PersistentVolumeClaim", "Cache"],
  who: [
    "Entra Application",
    "Entra Principal",
    "Entra FederatedIdentityCredential",
    "ServiceAccount",
  ],
  use: ["TemporalNamespace", "Entra AppRole", "Entra RoleAssignment", "AWS Role"],
  secrets: ["Secret", "Role", "RoleBinding"],
  callers: [
    "PeerAuthentication",
    "AuthorizationPolicy",
    "Sidecar",
    "ServiceEntry",
    "NetworkPolicy",
  ],
  runs: ["Deployment", "StatefulSet", "Service", "HTTPRoute", "Middleware", "ConfigMap"],
  watch: ["ServiceMonitor", "PodMonitor"],
}

@Component({
  selector: "app-platform-made",
  template: `
    @if (total() > 0) {
      <section class="panel">
        <h3>What happened</h3>
        <p class="headline">
          @if (picked()) {
            You picked {{ picked() }}.
          }
          Launchpad wrote {{ files() }} {{ files() === 1 ? "file" : "files" }} to Git. The platform
          {{ allReady() ? "made" : "is making" }} {{ total() }} things from them.
        </p>
        <ul>
          @for (row of rows(); track row.title) {
            <li [class.ready]="row.ready" [title]="row.kinds.join(', ')">
              <span class="dot"></span>
              <span class="title">{{ row.title }}</span>
              <span class="text">
                @for (part of techParts(row.text); track $index) {
                  @if (part.tech) {
                    <b class="tech">{{ part.text }}</b>
                  } @else {
                    {{ part.text }}
                  }
                }
              </span>
            </li>
          }
          @if (cleanupIn(); as left) {
            <li [class.ready]="cleanupRunning()" title="Temporal workflow">
              <span class="dot"></span>
              <span class="title">Cleanup</span>
              <span class="text"
                >A <b class="tech">Temporal</b> timer deletes this sandbox in {{ left }}</span
              >
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: [
    `
      .panel {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 1rem 1.25rem;
        margin-top: 1.5rem;
      }
      h3 {
        margin: 0 0 0.25rem;
        font-size: 1rem;
      }
      .headline {
        margin: 0 0 0.75rem;
        font-size: 0.9rem;
        opacity: 0.8;
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
        cursor: default;
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
      .text {
        opacity: 0.7;
      }
      @media (max-width: 600px) {
        li {
          grid-template-columns: 0.75rem 1fr;
        }
        .text {
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
  // Time left before the sandbox is deleted, such as "7:10". Empty outside a sandbox.
  readonly cleanupIn = input("")

  private readonly workspaceService = inject(WorkspaceService)
  protected readonly techParts = techParts
  protected readonly cleanupRunning = signal(false)

  protected readonly files = computed(() => this.resources().length)

  // The main kind the guest chose. A Workflow sandbox also holds an Api.
  protected readonly picked = computed(() => {
    const kinds = this.resources().map((r) => r.kind)
    const main = kinds.includes("Workflow") ? "Workflow" : kinds.includes("Api") ? "Api" : kinds[0]
    return main ? RESOURCE_KIND_LABELS[main] : ""
  })

  private readonly statuses = computed(() =>
    this.resources()
      .map((r) => this.statusMap()[statusKey(r.kind, r.name)])
      .filter((s): s is ResourceStatus => !!s),
  )

  protected readonly total = computed(() =>
    this.statuses().reduce((n, s) => n + (s.composed?.length ?? 0), 0),
  )

  protected readonly allReady = computed(() => this.statuses().every((s) => s.ready))

  protected readonly rows = computed<Row[]>(() => {
    const api = this.resources().find((r) => r.kind === "Api")
    const host = typeof api?.spec["host"] === "string" ? (api.spec["host"] as string) : ""
    const replicas = Number(api?.spec["replicas"] ?? 1)

    const row = (title: string, kinds: string[], text: (has: (k: string) => boolean) => string) => {
      const found = new Set<string>()
      let ready = true
      for (const s of this.statuses()) {
        const mine = (s.composed ?? []).filter((k) => kinds.includes(k))
        mine.forEach((k) => found.add(k))
        if (mine.length && !s.ready) ready = false
      }
      if (found.size === 0) return null
      return { title, kinds: [...found].sort(), ready, text: text((k) => found.has(k)) }
    }

    const known = Object.values(GROUP_KINDS).flat()
    const otherKinds = [
      ...new Set(
        this.statuses().flatMap((s) => (s.composed ?? []).filter((k) => !known.includes(k))),
      ),
    ]

    return [
      row("Real services", GROUP_KINDS["data"], (has) =>
        [
          has("AWS Table") && "a DynamoDB table in AWS",
          has("AWS Bucket") && "an S3 bucket in AWS",
          has("PersistentVolumeClaim") && "a Postgres database on its own disk",
          has("Cache") && "a Redis cache",
        ]
          .filter(Boolean)
          .join(", ")
          .replace(/^./, (c) => c.toUpperCase()),
      ),
      row("Who it is", GROUP_KINDS["who"], (has) =>
        has("Entra FederatedIdentityCredential")
          ? "An Entra app that logs in with no password"
          : "Its own identity in the cluster",
      ),
      row("What it may use", GROUP_KINDS["use"], (has) =>
        [
          has("TemporalNamespace") && "its own Temporal namespace, and the right to call it",
          has("AWS Role") && "AWS access to only its own table and bucket, with no stored keys",
        ]
          .filter(Boolean)
          .join(". ")
          .replace(/^./, (c) => c.toUpperCase()),
      ),
      row(
        "Connection details",
        GROUP_KINDS["secrets"],
        () => "Addresses and passwords, mounted as files only this app can read",
      ),
      row(
        "Who may call it",
        GROUP_KINDS["callers"],
        () => "Encrypted traffic, from an allow list only",
      ),
      row("How it runs", GROUP_KINDS["runs"], () => {
        const copies = replicas === 1 ? "1 copy" : `${replicas} copies`
        return host ? `${copies} behind ${host}` : copies
      }),
      row("How we watch it", GROUP_KINDS["watch"], () => "Metrics, collected automatically"),
      row("Other parts", otherKinds, () => otherKinds.join(", ")),
    ].filter((r): r is Row => r !== null)
  })

  constructor() {
    // The cleanup workflow starts with the sandbox, so one read is enough.
    effect(() => {
      if (!this.isGuest()) return
      this.workspaceService.getGuestCleanup(this.workspace()).subscribe({
        next: (c) => this.cleanupRunning.set(c.status === "running"),
        error: () => this.cleanupRunning.set(false),
      })
    })
  }
}
