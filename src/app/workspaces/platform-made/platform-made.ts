import { Component, computed, effect, inject, input, signal } from "@angular/core"
import { WorkspaceService } from "../../core/services/workspace.service"
import { techParts } from "../../core/tech-text"
import { Resource, ResourceStatus, statusKey } from "../../core/models/workspace.model"

interface Row {
  title: string
  text: string
  // The resource kinds behind the line, shown on hover.
  kinds: string[]
  ready: boolean
}

// A kind not listed in any group lands in "Other".
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

// Crossplane names the parts it is still waiting on by their composition name.
// Each pattern maps a name to the row it belongs to.
const NAME_GROUPS: [RegExp, string][] = [
  [/^(deployment|service|httproute|.*-middleware|.*configmap)$/, "runs"],
  [/^(entra-application|entra-federated-credential|entra-principal|serviceaccount)$/, "who"],
  [/^(entra-role|entra-grant|entra-scope-grant|temporal-)/, "use"],
  [/^(role|rolebinding)$/, "secrets"],
  [/^connection-/, "callers"],
  [/^(servicemonitor|podmonitor)$/, "watch"],
  [/^cache$/, "data"],
]

// The rows a not-ready resource is still waiting on. Null when the message
// doesn't say, so every row of that resource stays waiting.
export function waitingGroups(message: string | undefined): Set<string> | null {
  const m = /^Unready resources: (.*)$/.exec(message ?? "")
  if (!m || m[1].includes(" more")) return null
  const groups = new Set<string>()
  for (const name of m[1].split(/,\s*(?:and\s+)?|\s+and\s+/)) {
    const group = NAME_GROUPS.find(([re]) => re.test(name.trim()))?.[1]
    if (!group) return null
    groups.add(group)
  }
  return groups
}

@Component({
  selector: "app-platform-made",
  template: `
    @if (total() > 0) {
      <section class="panel">
        <h3>What happened</h3>
        <p class="headline">
          {{ files() }} {{ files() === 1 ? "file" : "files" }} in Git. {{ total() }} things
          {{ allReady() ? "made" : "being made" }}.
        </p>
        <ul>
          @for (row of rows(); track row.title) {
            <li [class.ready]="row.ready" [title]="row.kinds.join(', ')">
              <span class="dot"></span>
              <span class="title">{{ row.title }}</span>
              <span class="text">
                <!-- prettier-ignore -->
                @for (part of techParts(row.text); track $index) {@if (part.tech) {<b class="tech">{{ part.text }}</b>} @else {{{ part.text }}}}
              </span>
            </li>
          }
          @if (cleanupIn(); as left) {
            <li [class.ready]="cleanupRunning()" title="Temporal workflow">
              <span class="dot"></span>
              <span class="title">Cleanup</span>
              <span class="text"><b class="tech">Temporal</b> deletes it in {{ left }}</span>
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
        .panel {
          padding: 0.85rem 1rem;
        }
        li {
          grid-template-columns: 0.5rem 4.5rem 1fr;
          gap: 0.4rem;
          padding: 0.2rem 0;
          font-size: 0.8rem;
        }
        .title,
        .text {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
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
  // True once the rollout finished. A later blip, such as a demo worker restarting,
  // then leaves everything shown as made.
  readonly settled = input(false)

  private readonly workspaceService = inject(WorkspaceService)
  protected readonly techParts = techParts
  protected readonly cleanupRunning = signal(false)

  protected readonly files = computed(() => this.resources().length)

  private readonly statuses = computed(() =>
    this.resources()
      .map((r) => this.statusMap()[statusKey(r.kind, r.name)])
      .filter((s): s is ResourceStatus => !!s),
  )

  protected readonly total = computed(() =>
    this.statuses().reduce((n, s) => n + (s.composed?.length ?? 0), 0),
  )

  protected readonly allReady = computed(
    () => this.settled() || this.statuses().every((s) => s.ready),
  )

  protected readonly rows = computed<Row[]>(() => {
    const api = this.resources().find((r) => r.kind === "Api")
    const host = typeof api?.spec["host"] === "string" ? (api.spec["host"] as string) : ""
    const replicas = Number(api?.spec["replicas"] ?? 1)

    const row = (
      title: string,
      group: string,
      kinds: string[],
      text: (has: (k: string) => boolean) => string,
    ) => {
      const found = new Set<string>()
      let ready = true
      for (const s of this.statuses()) {
        const mine = (s.composed ?? []).filter((k) => kinds.includes(k))
        mine.forEach((k) => found.add(k))
        if (!mine.length || s.ready || this.settled()) continue
        if (waitingGroups(s.message)?.has(group) ?? true) ready = false
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
      row("Services", "data", GROUP_KINDS["data"], (has) =>
        [
          has("AWS Table") && "NoSQL database",
          has("AWS Bucket") && "Object storage",
          has("PersistentVolumeClaim") && "SQL database",
          has("Cache") && "Cache",
        ]
          .filter(Boolean)
          .join(", "),
      ),
      row("Identity", "who", GROUP_KINDS["who"], (has) =>
        has("Entra FederatedIdentityCredential")
          ? "An Entra app, no password"
          : "A unique ID issued by the platform",
      ),
      row("Access", "use", GROUP_KINDS["use"], (has) =>
        [
          has("TemporalNamespace") && "Its own Temporal namespace",
          has("AWS Role") && "Workload identity, no long-lived keys",
        ]
          .filter(Boolean)
          .join(". "),
      ),
      row(
        "Secrets",
        "secrets",
        GROUP_KINDS["secrets"],
        () => "Passwords in files only it can read",
      ),
      row("Callers", "callers", GROUP_KINDS["callers"], () => "Allow list only, encrypted"),
      row("Runs", "runs", GROUP_KINDS["runs"], () => {
        if (replicas > 1) return host ? `${replicas} workers at ${host}` : `${replicas} workers`
        return host ? `At ${host}` : "In the cluster"
      }),
      row("Metrics", "watch", GROUP_KINDS["watch"], () => "Collected automatically"),
      row("Other", "other", otherKinds, () => otherKinds.join(", ")),
    ].filter((r): r is Row => r !== null)
  })

  constructor() {
    // The cleanup workflow starts a moment after a new sandbox, so a miss is retried a few times.
    effect((onCleanup) => {
      if (!this.isGuest()) return
      const workspace = this.workspace()
      let tries = 0
      let timer: ReturnType<typeof setTimeout> | undefined
      const read = () =>
        this.workspaceService.getGuestCleanup(workspace).subscribe({
          next: (c) => this.cleanupRunning.set(c.status === "running"),
          error: () => {
            this.cleanupRunning.set(false)
            if (++tries < 10) timer = setTimeout(read, 3000)
          },
        })
      read()
      onCleanup(() => clearTimeout(timer))
    })
  }
}
