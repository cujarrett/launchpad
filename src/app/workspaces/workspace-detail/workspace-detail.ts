import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from "@angular/core"
import { ActivatedRoute, Router, RouterLink } from "@angular/router"
import { firstValueFrom, Subscription } from "rxjs"
import { HttpErrorResponse } from "@angular/common/http"
import { WorkspaceService } from "../../core/services/workspace.service"
import { RoleService } from "../../core/services/role.service"
import {
  Resource,
  ResourceKind,
  ResourceStatus,
  RESOURCE_KIND_LABELS,
  RESOURCE_KIND_ICONS,
} from "../../core/models/workspace.model"
import { ResourceCard } from "../resource-card/resource-card"
import { CreateResource } from "../../create/create-resource"
import { WorkspaceArch } from "../workspace-arch/workspace-arch"
import { GuestCreate, GUEST_KINDS } from "../guest-create/guest-create"
import { ProvisioningPipeline } from "../provisioning-pipeline/provisioning-pipeline"
import { SseService } from "../../core/services/sse.service"
import { environment } from "../../../environments/environment"

// Must match guestTTL in launchpad-api's guest.go — used only to derive the workspace's
// createdAt from its expiresAt for the provisioning-pipeline's stale-data bound check.
const GUEST_TTL_MS = 10 * 60 * 1000

const PLATFORM_KINDS: ResourceKind[] = [
  "XSpa",
  "XApi",
  "XSql",
  "XNoSql",
  "XObjectStorage",
  "XTopic",
  "XSubscription",
  "XWordpress",
]

const PLATFORM_KIND_DESC: Record<ResourceKind, string> = {
  XApi: "REST API with HTTPS, metrics, and optional service bindings.",
  XSpa: "Static frontend app served over HTTPS.",
  XSql: "Relational database with automatic service binding.",
  XNoSql: "NoSQL key-value store. Fast lookups, flexible schemas.",
  XObjectStorage: "Object storage for files, assets, and blobs.",
  XCache: "In-memory cache cluster.",
  XTopic: "Async messaging topic with JetStream.",
  XSubscription: "Durable message subscription wired to a topic.",
  XWordpress: "Managed WordPress site with MariaDB.",
}

@Component({
  selector: "app-workspace-detail",
  imports: [
    ResourceCard,
    CreateResource,
    WorkspaceArch,
    GuestCreate,
    ProvisioningPipeline,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // allPreviewsReady: true once every XApi/XSpa with a host has confirmed /healthz
  template: `
    <div class="page">
      @if (isGuest()) {
        @if (isExpired()) {
          <div class="guest-banner expiring">
            ⏰ This sandbox has expired and will be deleted shortly.
          </div>
        } @else {
          <div class="guest-banner" [class.expiring]="isExpiringSoon()">
            🧪 Sandbox workspace
            @if (guestExpiresAt()) {
              — auto-deletes in
              <strong>{{ guestCountdown() }}</strong>
              @if (isExpiringSoon()) {
                &nbsp;⚠️
              }
            }
          </div>
        }
      }

      <div class="page-header">
        <div class="page-title-group">
          <a class="breadcrumb" routerLink="/">Workspaces</a>
          <span class="breadcrumb-sep">›</span>
          <h1>{{ name() }}</h1>
        </div>
        <div class="page-header-actions">
          @if (!loading()) {
            <div class="view-toggle">
              <button
                [class.active]="viewMode() === 'cards'"
                class="secondary"
                (click)="viewMode.set('cards')"
              >
                Cards
              </button>
              @if (!pipelineActive()) {
                <button
                  [class.active]="viewMode() === 'arch'"
                  class="secondary"
                  (click)="viewMode.set('arch')"
                >
                  Arch
                </button>
              }
            </div>
          }
          @if (!creating()) {
            @if (roleService.isContributor()) {
              @if (!loading() && resources().length === 0) {
                @if (!confirmDelete()) {
                  <button class="danger" (click)="confirmDelete.set(true)">Delete workspace</button>
                } @else {
                  <button
                    class="secondary"
                    (click)="confirmDelete.set(false); deleteWorkspaceError.set(null)"
                  >
                    Cancel
                  </button>
                  <button
                    class="danger"
                    [disabled]="deletingWorkspace()"
                    (click)="doDeleteWorkspace()"
                  >
                    {{ deletingWorkspace() ? "Deleting…" : "Confirm delete" }}
                  </button>
                }
                @if (deleteWorkspaceError()) {
                  <span class="field-error" style="align-self:center">{{
                    deleteWorkspaceError()
                  }}</span>
                }
              }
              <button (click)="startCreate()">+ New Resource</button>
            } @else if (isGuest() && !isExpired() && guestHasAvailableKinds()) {
              <button (click)="creating.set(true)">+ Add Resource</button>
            }
          }
        </div>
      </div>

      @if (creating()) {
        @if (isGuest()) {
          <app-guest-create
            style="display:block;margin-bottom:1.5rem"
            [workspace]="name()"
            [existingResources]="resources()"
            (created)="onCreated()"
            (cancelled)="creating.set(false)"
            (commitPlanChange)="commitPlan.set($event)"
          />
        } @else {
          <div class="create-panel">
            @if (!selectedKind()) {
              <h3 class="create-heading">Choose a resource type</h3>
              <div class="kind-grid">
                @for (k of platformKinds; track k) {
                  <button class="kind-card" type="button" (click)="selectedKind.set(k)">
                    <span class="kind-icon">{{ icons[k] }}</span>
                    <span class="kind-name">{{ labels[k] }}</span>
                    <span class="kind-desc">{{ kindDesc[k] }}</span>
                  </button>
                }
              </div>
              <div class="form-actions">
                <button type="button" class="secondary" (click)="cancelCreate()">Cancel</button>
              </div>
            } @else {
              <app-create-resource
                [workspace]="name()"
                [kind]="selectedKind()!"
                (created)="onCreated()"
                (cancelled)="cancelCreate()"
              />
            }
          </div>
        }
      }

      @if (loading()) {
        <p class="muted">Loading...</p>
      } @else {
        @if (viewMode() === "arch" && !pipelineActive()) {
          <app-workspace-arch [resources]="resources()" [statusMap]="statusMap()" />
        }
        <!-- Always rendered so resource-card health polling drives allPreviewsReady. -->
        <div [hidden]="viewMode() === 'arch'">
          <div class="card-grid">
            @for (resource of sortedResources(); track resource.name) {
              <app-resource-card
                [resource]="resource"
                [workspace]="name()"
                [status]="statusMap()[resource.name] ?? null"
                [expanded]="expandedResource() === resource.name"
                [canEdit]="roleService.isContributor()"
                [canEditConnections]="isGuest() && resource.kind === 'XApi'"
                [dependencyReady]="resource.kind !== 'XSpa' || spaApiReady()"
                (toggled)="
                  expandedResource.set(expandedResource() === resource.name ? null : resource.name)
                "
                (deleted)="handleDelete($event)"
                (saved)="expandedResource.set(null); loadResources()"
                (createKind)="startCreateForKind($event)"
                (previewReady)="handlePreviewReady($event)"
              />
            } @empty {
              @if (!creating()) {
                <p class="muted">
                  No resources yet.{{ isGuest() ? " Add one above to watch it spin up!" : "" }}
                </p>
              }
            }
          </div>
        </div>
      }
      <!-- Pipeline is outside the loading gate so it stays mounted across resource refreshes.
           Hidden (not removed) in Arch view once provisioning finishes — the diagram shows live
           health itself, so the collapsed "Details" summary is redundant there. Still shown
           while pipelineActive(), since that's also what gates the arch diagram from rendering
           at all (see above), so hiding it too would leave the tab blank during provisioning. -->
      <div [hidden]="viewMode() === 'arch' && !pipelineActive()">
        <app-provisioning-pipeline
          [workspace]="name()"
          [initialPhaseTimes]="guestPhaseTimes()"
          [initialDoneTime]="guestDoneAt()"
          [minPhaseTime]="guestMinPhaseTime()"
          [resources]="resources()"
          [statusMap]="statusMap()"
          [podStatusMap]="podStatusMap()"
          [allPreviewsReady]="allPreviewsReady()"
          [commitPlan]="commitPlan()"
        />
      </div>
    </div>
  `,
  styles: [
    `
      .guest-banner {
        background: #1a1a2e;
        border: 1px solid #3b82f6;
        border-radius: 6px;
        padding: 0.6rem 1rem;
        margin-bottom: 1rem;
        font-size: 0.875rem;
        color: #93c5fd;
      }
      .guest-banner.expiring {
        border-color: #f59e0b;
        color: #fcd34d;
      }
      .create-panel {
        padding: 1.5rem;
      }
      .create-heading {
        margin: 0 0 1rem;
      }
      .kind-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 0.75rem;
        margin-bottom: 1.25rem;
      }
      .kind-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
        padding: 0.75rem;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        cursor: pointer;
        text-align: left;
        transition:
          border-color 0.15s,
          background 0.15s;
      }
      .kind-card:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.25);
      }
      .kind-icon {
        font-size: 1.4rem;
        line-height: 1;
      }
      .kind-name {
        font-size: 0.875rem;
        font-weight: 600;
      }
      .kind-desc {
        font-size: 0.75rem;
        opacity: 0.6;
        line-height: 1.3;
      }
      app-provisioning-pipeline {
        display: block;
        margin-top: 1.5rem;
      }
    `,
  ],
})
export class WorkspaceDetail implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly workspaceService = inject(WorkspaceService)
  private readonly sseService = inject(SseService)
  protected readonly roleService = inject(RoleService)
  private sseSub?: Subscription
  private readonly seenReady = new Set<string>()
  private tickInterval?: ReturnType<typeof setInterval>

  protected readonly name = signal("")
  protected readonly guestExpiresAt = signal<string | null>(null)
  // Workspace's actual createdAt, derived from expiresAt (createdAt + guestTTL). Passed to
  // provisioning-pipeline so it can discard any phase timestamp (from localStorage or a stale
  // server read) that claims to predate the workspace's own creation.
  protected readonly guestMinPhaseTime = computed<number | null>(() => {
    const expiresAt = this.guestExpiresAt()
    if (!expiresAt) return null
    const ms = new Date(expiresAt).getTime()
    return isNaN(ms) ? null : ms - GUEST_TTL_MS
  })
  protected readonly guestPhaseTimes = signal<Record<string, string>>({})
  protected readonly guestDoneAt = signal<string | null>(null)
  protected readonly resources = signal<Resource[]>([])
  protected readonly loading = signal(true)
  protected readonly creating = signal(false)
  protected readonly selectedKind = signal<ResourceKind | null>(null)
  protected readonly statusMap = signal<Partial<Record<string, ResourceStatus>>>({})
  protected readonly podStatusMap = signal<Partial<Record<string, ResourceStatus>>>({})
  protected readonly commitPlan = signal<string[]>([])
  protected readonly expandedResource = signal<string | null>(null)
  protected readonly viewMode = signal<"cards" | "arch">("cards")
  protected readonly confirmDelete = signal(false)
  protected readonly deletingWorkspace = signal(false)
  protected readonly deleteWorkspaceError = signal<string | null>(null)
  private readonly tick = signal(0)
  private readonly confirmedPreviewSet = signal<ReadonlySet<string>>(new Set())
  protected readonly guestHasAvailableKinds = computed(() => {
    const existing = new Set(this.resources().map((r) => r.kind))
    return GUEST_KINDS.some((k) => !existing.has(k))
  })

  protected readonly sortedResources = computed(() =>
    [...this.resources()].sort((a, b) => {
      if (a.kind === "XSpa") return -1
      if (b.kind === "XSpa") return 1
      return 0
    }),
  )

  protected readonly spaApiReady = computed(() => {
    const api = this.resources().find((r) => r.kind === "XApi")
    if (!api) return true
    // Cluster-internal APIs (no public host) can't be probed from the browser,
    // so don't gate the SPA on a confirmation that can never arrive.
    if (!api.spec["host"]) return true
    return this.confirmedPreviewSet().has(api.name)
  })

  protected readonly allPreviewsReady = computed(() => {
    const previewable = this.resources().filter(
      (r) => (r.kind === "XApi" || r.kind === "XSpa") && r.spec["host"],
    )
    if (previewable.length === 0) return true
    const confirmed = this.confirmedPreviewSet()
    return previewable.every((r) => confirmed.has(r.name))
  })

  // True while the pipeline list has something to show — cards are hidden during this time.
  protected readonly pipelineActive = computed(() => {
    if (this.commitPlan().length > 0) return true
    const resources = this.resources()
    if (resources.length === 0) return false
    const statusMap = this.statusMap()
    if (!resources.every((r) => statusMap[r.name]?.ready)) return true
    const pods = Object.values(this.podStatusMap())
    if (pods.some((p) => p?.initContainers?.some((ic) => !ic.completed))) return true
    return !this.allPreviewsReady()
  })

  readonly platformKinds = PLATFORM_KINDS
  readonly labels = RESOURCE_KIND_LABELS
  readonly icons = RESOURCE_KIND_ICONS
  readonly kindDesc = PLATFORM_KIND_DESC

  protected isGuest(): boolean {
    return this.name().startsWith("guest-")
  }

  protected guestCountdown(): string {
    this.tick()
    const expiresAt = this.guestExpiresAt()
    if (!expiresAt) return "?"
    const remaining = new Date(expiresAt).getTime() - Date.now()
    if (remaining <= 0) return "Expired"
    const m = Math.floor(remaining / 60_000)
    const s = Math.floor((remaining % 60_000) / 1000)
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  protected isExpired(): boolean {
    this.tick()
    const expiresAt = this.guestExpiresAt()
    if (!expiresAt) return false
    return new Date(expiresAt).getTime() - Date.now() <= 0
  }

  protected isExpiringSoon(): boolean {
    this.tick()
    const expiresAt = this.guestExpiresAt()
    if (!expiresAt) return false
    const remaining = new Date(expiresAt).getTime() - Date.now()
    return remaining > 0 && remaining < 120_000
  }

  async ngOnInit() {
    const workspaceName = this.route.snapshot.paramMap.get("name") ?? ""
    this.name.set(workspaceName)

    if (this.isGuest()) {
      this.tickInterval = setInterval(() => this.tick.set(this.tick() + 1), 1000)
      // Load expiry from the workspaces list (already enriched by the API).
      try {
        const workspaces = await firstValueFrom(this.workspaceService.getWorkspaces())
        const ws = workspaces.find((w) => w.name === workspaceName)
        if (ws?.expiresAt) this.guestExpiresAt.set(ws.expiresAt)
        if (ws?.phaseTimes) this.guestPhaseTimes.set(ws.phaseTimes)
        if (ws?.doneAt) this.guestDoneAt.set(ws.doneAt)
      } catch {
        // Non-fatal — countdown shows '?' if unavailable.
      }
    }

    // Start SSE independently — don't block on resource loading.
    this.sseSub = this.sseService.watchStatus(`${environment.apiUrl}/status/watch`).subscribe({
      next: (s) => {
        if (s.workspace !== workspaceName) return
        if (s.kind === "Pod") {
          this.podStatusMap.update((m) => ({ ...m, [s.name]: s }))
          return
        }
        if (s.ready) this.seenReady.add(s.name)
        // Suppress ERROR until the resource has been seen ready at least once —
        // avoids the jarring ERROR flash on initial SSE connect during Crossplane sync.
        const status = !s.synced && !this.seenReady.has(s.name) ? { ...s, synced: true } : s
        this.statusMap.update((m) => ({ ...m, [s.name]: status }))
      },
      error: (e) => console.error("[WorkspaceDetail] SSE error", e),
    })

    try {
      await this.loadResources()
    } catch (e) {
      console.error("[WorkspaceDetail] loadResources failed", e)
      this.loading.set(false)
    }
  }

  ngOnDestroy() {
    this.sseSub?.unsubscribe()
    clearInterval(this.tickInterval)
  }

  startCreateForKind(kind: ResourceKind) {
    this.selectedKind.set(kind)
    this.creating.set(true)
    this.expandedResource.set(null)
  }

  startCreate() {
    this.selectedKind.set(null)
    this.creating.set(true)
  }

  cancelCreate() {
    this.creating.set(false)
    this.selectedKind.set(null)
  }

  async onCreated() {
    this.cancelCreate()
    await this.loadResources(true)
    // GitHub Contents API can return a stale directory listing right after
    // sequential commits (e.g. XSql + XApi). Reload once after a short delay
    // to catch any propagation lag.
    setTimeout(() => this.loadResources(true), 1500)
  }

  async handleDelete(name: string) {
    await firstValueFrom(this.workspaceService.deleteResource(this.name(), name))
    await this.loadResources()
  }

  handlePreviewReady(name: string) {
    this.confirmedPreviewSet.update((s) => new Set([...s, name]))
  }

  private initialLoadDone = false

  async loadResources(suppressAutoCreate = false) {
    // Only show the loading indicator on the very first load — subsequent
    // refreshes (after create/delete) update resources silently so the pipeline
    // component isn't destroyed and recreated on every commit.
    if (!this.initialLoadDone) this.loading.set(true)

    // On the very first load, the workspace's namespace.yaml/guest.yaml may not
    // have landed in Git yet — the list page now navigates here without waiting
    // for that request to finish. Retry briefly instead of surfacing a hard
    // error for what's normally a sub-second window.
    const attempts = this.initialLoadDone ? 1 : 6
    let resources: Resource[] | undefined
    let lastErr: unknown
    for (let i = 0; i < attempts; i++) {
      try {
        resources = await firstValueFrom(this.workspaceService.getResources(this.name()))
        break
      } catch (e) {
        lastErr = e
        if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 700))
      }
    }
    if (resources === undefined) throw lastErr

    this.resources.set(resources)
    if (!suppressAutoCreate && resources.length === 0) this.creating.set(true)
    this.initialLoadDone = true
    this.loading.set(false)
  }

  async doDeleteWorkspace() {
    this.deletingWorkspace.set(true)
    this.deleteWorkspaceError.set(null)
    try {
      await firstValueFrom(this.workspaceService.deleteWorkspace(this.name()))
      await this.router.navigate(["/"])
    } catch (err: unknown) {
      const msg =
        err instanceof HttpErrorResponse
          ? typeof err.error === "string" && err.error.trim()
            ? err.error.trim()
            : `HTTP ${err.status}`
          : err instanceof Error
            ? err.message
            : "Failed to delete workspace"
      this.deleteWorkspaceError.set(msg)
    } finally {
      this.deletingWorkspace.set(false)
    }
  }
}
