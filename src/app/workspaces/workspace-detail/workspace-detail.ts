import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
  untracked,
  viewChild,
} from "@angular/core"
import { ActivatedRoute, Router, RouterLink } from "@angular/router"
import { firstValueFrom, Subscription } from "rxjs"
import { KindIcon } from "../../core/kind-icon/kind-icon"
import { WorkspaceService } from "../../core/services/workspace.service"
import { httpErrorMessage } from "../../core/http-error"
import { RoleService } from "../../core/services/role.service"
import {
  Resource,
  ResourceKind,
  ResourceStatus,
  RESOURCE_KIND_LABELS,
  statusKey,
} from "../../core/models/workspace.model"
import { ResourceCard } from "../resource-card/resource-card"
import { CreateResource } from "../../create/create-resource"
import { WorkspaceArch } from "../workspace-arch/workspace-arch"
import { GuestCreate, guestAvailableKinds } from "../guest-create/guest-create"
import { ProvisioningPipeline } from "../provisioning-pipeline/provisioning-pipeline"
import { PlatformMade } from "../platform-made/platform-made"
import { TryWorkflow } from "../try-workflow/try-workflow"
import { SseService } from "../../core/services/sse.service"
import { environment } from "../../../environments/environment"

// Must match guestTTL in launchpad-api's guest.go - used only to derive the workspace's
// createdAt from its expiresAt for the provisioning-pipeline's stale-data bound check.
const GUEST_TTL_MS = 10 * 60 * 1000

const PLATFORM_KINDS: ResourceKind[] = [
  "Spa",
  "Api",
  "Sql",
  "NoSql",
  "ObjectStorage",
  "Topic",
  "Subscription",
  "Wordpress",
]

const PLATFORM_KIND_DESC: Record<ResourceKind, string> = {
  Api: "REST API with HTTPS, metrics, and optional service bindings.",
  Spa: "Static frontend app served over HTTPS.",
  Sql: "Relational database with automatic service binding.",
  NoSql: "NoSQL key-value store. Fast lookups, flexible schemas.",
  ObjectStorage: "Object storage for files, assets, and blobs.",
  Cache: "In-memory cache cluster.",
  Topic: "Async messaging topic with JetStream.",
  Subscription: "Durable message subscription wired to a topic.",
  Wordpress: "Managed WordPress site with MariaDB.",
  GraphApi: "API whose schema joins a federated graph.",
  FederatedGraph: "One GraphQL endpoint joining every subgraph.",
  WorkflowSpace: "Steps that finish even when a server dies. Runs on Temporal.",
}

@Component({
  selector: "app-workspace-detail",
  imports: [
    KindIcon,
    ResourceCard,
    CreateResource,
    WorkspaceArch,
    GuestCreate,
    ProvisioningPipeline,
    PlatformMade,
    TryWorkflow,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // allPreviewsReady: true once every Api/Spa with a host has confirmed /healthz
  template: `
    <div class="page">
      @if (isGuest()) {
        @if (isExpired()) {
          <div class="guest-banner expiring">
            ⏰
            @if (guestGone()) {
              This sandbox expired and was deleted. <a routerLink="/">Start a new one</a>
            } @else {
              This sandbox has expired and will be deleted shortly.
            }
          </div>
        } @else {
          <div class="guest-banner" [class.expiring]="isExpiringSoon()">
            🧪 Sandbox workspace
            @if (guestExpiresAt()) {
              - auto-deletes in
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

      @if ((creating() || guestNeedsPick()) && !(isGuest() && isExpired())) {
        @if (isGuest()) {
          <app-guest-create
            style="display:block;margin-bottom:1.5rem"
            [workspace]="name()"
            [existingResources]="resources()"
            [allowCancel]="resources().length > 0"
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
                    <app-kind-icon class="kind-icon" [kind]="k" />
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

      <!-- Ready: the live link and demo lead, above the cards, so phones see them first.
           Done: the rollout steps move to the bottom as a receipt.
           CSS order moves them without remounting. -->
      <div class="story">
        <div class="cards">
          @if (loading()) {
            <p class="muted">Loading...</p>
          } @else if (loadError()) {
            <p class="field-error">
              Still waiting on your workspace - this is taking longer than usual.
              <button type="button" (click)="retryLoadResources()">Retry</button>
            </p>
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
                    [status]="statusMap()[statusKey(resource.kind, resource.name)] ?? null"
                    [expanded]="expandedResource() === resource.name"
                    [canEdit]="roleService.isContributor()"
                    [canEditConnections]="isGuest() && resource.kind === 'Api'"
                    [dependencyReady]="resource.kind !== 'Spa' || spaApiReady()"
                    (toggled)="
                      expandedResource.set(
                        expandedResource() === resource.name ? null : resource.name
                      )
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
        </div>
        @if (liveApp(); as app) {
          <a
            class="live-cta"
            [href]="'https://' + app.host"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="live-text">
              <span class="live-title">Your app is live</span>
              <span class="live-sub">{{ app.sub }}</span>
            </span>
            <span class="live-btn" [title]="app.host">Open your app ↗</span>
          </a>
        }
        <!-- The WorkflowSpace demo's payoff is the crash panel below, so its button starts it. -->
        @if (workflowDemo() && !tryWorkflow()?.everPlaced()) {
          <div class="live-cta">
            <span class="live-text">
              <span class="live-title">Your durable workflow is live</span>
              <span class="live-sub"
                >Two servers are running your order API. Crash one mid-order.</span
              >
            </span>
            <button type="button" class="live-btn" (click)="tryWorkflow()?.placeOrder()">
              Start the demo ↓
            </button>
          </div>
        }
        <!-- Outside the loading gate, so it stays mounted across resource refreshes.
           Once done it collapses to each step's time. Arch view hides it then, because the
           diagram shows live health itself. -->
        <!-- An empty sandbox showing the picker has no run to show. Phase times the server
             still holds from a failed attempt would otherwise draw a stuck rollout. -->
        <div
          [hidden]="
            (viewMode() === 'arch' && !pipelineActive()) ||
            (guestNeedsPick() && commitPlan().length === 0)
          "
          [style.order]="pipelineActive() ? 3 : 5"
        >
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
            [settled]="!pipelineActive()"
          />
        </div>
        <!-- The demo appears once the sandbox is ready, and is then the thing to do. -->
        @if (workflowDemo(); as demo) {
          <app-try-workflow
            [host]="demo.host"
            [apiName]="demo.apiName"
            [podStatusMap]="podStatusMap()"
          />
        }
        <app-platform-made
          [workspace]="name()"
          [resources]="resources()"
          [statusMap]="statusMap()"
          [isGuest]="isGuest()"
          [cleanupIn]="isGuest() ? guestCountdown() : ''"
          [settled]="!pipelineActive()"
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
      @media (max-width: 480px) {
        .create-panel {
          padding: 0.5rem 0 1rem;
        }
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
      .story {
        display: flex;
        flex-direction: column;
      }
      .cards {
        order: 2;
      }
      app-try-workflow {
        display: block;
        order: 1;
        margin-bottom: 1.5rem;
      }
      app-platform-made {
        order: 4;
      }
      .live-cta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        order: 0;
        margin-bottom: 1.5rem;
        padding: 1.25rem 1.5rem;
        border-radius: 14px;
        border: 1px solid #34d399;
        background: linear-gradient(120deg, rgba(16, 185, 129, 0.18), rgba(99, 102, 241, 0.12));
        box-shadow: 0 8px 30px rgba(16, 185, 129, 0.2);
        color: inherit;
        text-decoration: none;
      }
      .live-cta:hover {
        border-color: #6ee7b7;
      }
      .live-text {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }
      .live-title {
        font-size: 1.25rem;
        font-weight: 700;
      }
      .live-sub {
        font-size: 0.9rem;
        opacity: 0.8;
      }
      .live-btn {
        padding: 0.65rem 1.1rem;
        border: none;
        border-radius: 10px;
        background: #10b981;
        color: #04261b;
        font: inherit;
        font-weight: 700;
        white-space: nowrap;
        cursor: pointer;
      }
      @media (max-width: 600px) {
        .live-cta {
          padding: 0.9rem 1rem;
          gap: 0.6rem;
        }
        .live-title {
          font-size: 1.05rem;
        }
        .live-btn {
          width: 100%;
          text-align: center;
          white-space: normal;
        }
      }
    `,
  ],
})
export class WorkspaceDetail implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute)
  protected readonly tryWorkflow = viewChild(TryWorkflow)
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
  private readonly guestMetaTried = signal(false)
  // Its cleanup workflow finished, so the sandbox no longer exists. A deleted sandbox
  // has no expiry left to read, so this is the only way the page can tell.
  protected readonly guestGone = signal(false)
  protected readonly resources = signal<Resource[]>([])
  protected readonly loading = signal(true)
  protected readonly creating = signal(false)
  protected readonly loadError = signal(false)
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
  // An empty, live sandbox always shows the picker, so a guest can't lose the next step.
  // awaitingResources covers the gap between a create and its files loading.
  protected readonly guestNeedsPick = computed(
    () =>
      this.isGuest() &&
      !this.isExpired() &&
      !this.loading() &&
      !this.awaitingResources() &&
      this.resources().length === 0,
  )
  private readonly awaitingResources = signal(false)

  protected readonly guestHasAvailableKinds = computed(
    () => guestAvailableKinds(this.resources().map((r) => r.kind)).length > 0,
  )

  protected readonly sortedResources = computed(() =>
    [...this.resources()].sort((a, b) => {
      if (a.kind === "Spa") return -1
      if (b.kind === "Spa") return 1
      return 0
    }),
  )

  protected readonly spaApiReady = computed(() => {
    const api = this.resources().find((r) => r.kind === "Api")
    if (!api) return true
    // Cluster-internal APIs (no public host) can't be probed from the browser,
    // so don't gate the SPA on a confirmation that can never arrive.
    if (!api.spec["host"]) return true
    return this.confirmedPreviewSet().has(api.name)
  })

  protected readonly allPreviewsReady = computed(() => {
    const previewable = this.resources().filter(
      (r) => (r.kind === "Api" || r.kind === "Spa") && r.spec["host"],
    )
    if (previewable.length === 0) return true
    const confirmed = this.confirmedPreviewSet()
    return previewable.every((r) => confirmed.has(r.name))
  })

  // True while the pipeline list has something to show - cards are hidden during this time.
  private readonly rolloutRunning = computed(() => {
    if (this.commitPlan().length > 0) return true
    const resources = this.resources()
    if (resources.length === 0) return false
    const statusMap = this.statusMap()
    if (!resources.every((r) => statusMap[statusKey(r.kind, r.name)]?.ready)) return true
    const pods = Object.values(this.podStatusMap())
    if (pods.some((p) => p?.initContainers?.some((ic) => !ic.completed))) return true
    return !this.allPreviewsReady()
  })

  // Resources that have finished one rollout. A later blip, such as a demo worker
  // restarting after an unplug, is not a new rollout. Adding a resource is.
  private readonly settled = signal<Set<string>>(new Set())
  private readonly recordSettled = effect(() => {
    const resources = this.resources()
    if (resources.length === 0) return
    // A sandbox that finished before this page loaded starts settled, so a refresh doesn't replay the rollout.
    const finishedEarlier = !!this.guestDoneAt() && untracked(() => this.settled().size === 0)
    if (finishedEarlier || !this.rolloutRunning()) {
      untracked(() => this.settled.set(new Set(resources.map((r) => statusKey(r.kind, r.name)))))
    }
  })

  protected readonly pipelineActive = computed(() => {
    if (this.commitPlan().length > 0) return true
    // Until the first read of the sandbox's saved finish time, a refresh can't tell
    // a finished sandbox from one mid-rollout.
    if (this.isGuest() && !this.guestMetaTried()) return false
    const settled = this.settled()
    const allSettled =
      settled.size > 0 && this.resources().every((r) => settled.has(statusKey(r.kind, r.name)))
    return allSettled ? false : this.rolloutRunning()
  })

  // A settled sandbox skips waiting on this page's own health checks after a refresh.
  private readonly readyToTry = computed(
    () =>
      this.allPreviewsReady() ||
      (!this.pipelineActive() && (!this.isGuest() || this.guestMetaTried())),
  )

  // The payoff of a sandbox. Shown once the readiness probe passes.
  // WorkflowSpace sandboxes show their demo panel instead.
  protected readonly liveApp = computed(() => {
    const resources = this.resources()
    if (!this.readyToTry() || resources.some((r) => r.kind === "WorkflowSpace")) return null
    const withHost = (kind: string) =>
      resources.find((r) => r.kind === kind && typeof r.spec["host"] === "string")
    const spa = withHost("Spa")
    const target = spa ?? withHost("Api")
    if (!target) return null
    return {
      host: target.spec["host"] as string,
      sub: spa ? "Live calls from your page to every service." : "Live calls to every service.",
    }
  })

  // A WorkflowSpace sandbox's Api runs the demo.
  protected readonly workflowDemo = computed(() => {
    const resources = this.resources()
    if (!resources.some((r) => r.kind === "WorkflowSpace")) return null
    const api = resources.find((r) => r.kind === "Api" && typeof r.spec["host"] === "string")
    // Waits for the readiness probe, so the workers are serving before the panel appears.
    if (!api || !this.readyToTry()) return null
    return { host: api.spec["host"] as string, apiName: api.name }
  })

  readonly platformKinds = PLATFORM_KINDS
  readonly labels = RESOURCE_KIND_LABELS
  readonly kindDesc = PLATFORM_KIND_DESC
  protected readonly statusKey = statusKey

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
    if (this.guestGone()) return true
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

    // Set by the sandbox picker - the create commit is still in flight, so there is
    // nothing to fetch yet. history.state outlives the page load, so clear it once
    // read or a reload makes an old sandbox look brand new.
    const fresh = (history.state as { fresh?: boolean } | null)?.fresh === true
    if (fresh) history.replaceState({ ...history.state, fresh: false }, "")

    if (this.isGuest()) {
      this.tickInterval = setInterval(() => this.tick.set(this.tick() + 1), 1000)
      // Optimistic expiry - off by the create round trip until the server's value lands.
      if (fresh) this.guestExpiresAt.set(new Date(Date.now() + GUEST_TTL_MS).toISOString())
      // Not awaited - the countdown must never gate rendering.
      void this.loadGuestMeta(workspaceName)
      if (!fresh) {
        this.workspaceService.getGuestCleanup(workspaceName).subscribe({
          next: (c) => this.guestGone.set(c.status === "completed"),
          error: () => {},
        })
      }
    }

    if (fresh) {
      this.resources.set([])
      this.suppressLoadingIndicator = true
      this.loading.set(false)
      this.creating.set(true)
    }

    // Start SSE independently - don't block on resource loading.
    this.sseSub = this.sseService.watchStatus(`${environment.apiUrl}/status/watch`).subscribe({
      next: (s) => {
        if (s.workspace !== workspaceName) return
        if (s.kind === "Pod") {
          this.podStatusMap.update((m) => {
            const { [s.name]: _gone, ...rest } = m
            return s.deleted ? rest : { ...m, [s.name]: s }
          })
          return
        }
        const key = statusKey(s.kind, s.name)
        if (s.ready) this.seenReady.add(key)
        // Suppress ERROR until the resource has been seen ready at least once -
        // avoids the jarring ERROR flash on initial SSE connect during Crossplane sync.
        const status = !s.synced && !this.seenReady.has(key) ? { ...s, synced: true } : s
        this.statusMap.update((m) => ({ ...m, [key]: status }))
      },
      error: (e) => console.error("[WorkspaceDetail] SSE error", e),
    })

    try {
      await this.loadResources()
    } catch (e) {
      console.error("[WorkspaceDetail] loadResources failed", e)
      this.loading.set(false)
      this.loadError.set(true)
    }
  }

  protected retryLoadResources() {
    this.loadError.set(false)
    this.loading.set(true)
    this.loadResources().catch((e) => {
      console.error("[WorkspaceDetail] loadResources retry failed", e)
      this.loading.set(false)
      this.loadError.set(true)
    })
  }

  ngOnDestroy() {
    this.destroyed = true
    this.sseSub?.unsubscribe()
    clearInterval(this.tickInterval)
  }

  // Expiry and phase times come from /workspaces. A just-launched workspace isn't in
  // that response yet, and one miss leaves the countdown on '?' for good - so keep asking.
  private async loadGuestMeta(workspaceName: string) {
    for (let attempt = 0; attempt < 6 && !this.destroyed; attempt++) {
      try {
        const workspaces = await firstValueFrom(this.workspaceService.getWorkspaces())
        const ws = workspaces.find((w) => w.name === workspaceName)
        if (ws) {
          if (ws.expiresAt) this.guestExpiresAt.set(ws.expiresAt)
          if (ws.phaseTimes) this.guestPhaseTimes.set(ws.phaseTimes)
          if (ws.doneAt) this.guestDoneAt.set(ws.doneAt)
          return
        }
      } catch {
        // Non-fatal - countdown falls back to the optimistic expiry, or '?'.
      } finally {
        this.guestMetaTried.set(true)
      }
      // The API caches /workspaces, so retrying sooner just re-reads the same stale miss.
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
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
    this.awaitingResources.set(true)
    this.cancelCreate()
    await this.loadResources(true)
    // GitHub Contents API can return a stale directory listing right after
    // sequential commits (e.g. Sql + Api). Reload once after a short delay
    // to catch any propagation lag.
    setTimeout(async () => {
      await this.loadResources(true)
      this.awaitingResources.set(false)
    }, 1500)
  }

  async handleDelete(name: string) {
    await firstValueFrom(this.workspaceService.deleteResource(this.name(), name))
    await this.loadResources()
  }

  handlePreviewReady(name: string) {
    this.confirmedPreviewSet.update((s) => new Set([...s, name]))
  }

  private initialLoadDone = false
  private suppressLoadingIndicator = false
  private destroyed = false

  async loadResources(suppressAutoCreate = false) {
    // Only show the loading indicator on the very first load - subsequent
    // refreshes (after create/delete) update resources silently so the pipeline
    // component isn't destroyed and recreated on every commit.
    if (!this.initialLoadDone && !this.suppressLoadingIndicator) this.loading.set(true)

    // On the very first load, the workspace's namespace.yaml/guest.yaml may not
    // have landed in Git yet - the list page now navigates here without waiting
    // for that request to finish. GitHub's API is occasionally slow enough that
    // a short retry window isn't always enough, so retry generously (up to
    // ~25s) rather than surfacing a hard error - and stay in the loading state
    // the whole time so it never looks like a silent failure requiring a
    // manual refresh.
    const attempts = this.initialLoadDone ? 1 : 25
    let resources: Resource[] | undefined
    let lastErr: unknown
    for (let i = 0; i < attempts; i++) {
      try {
        resources = await firstValueFrom(this.workspaceService.getResources(this.name()))
        break
      } catch (e) {
        lastErr = e
        // The commit normally lands within ~2s - poll fast for that, then drip.
        if (i < attempts - 1)
          await new Promise((resolve) => setTimeout(resolve, i < 6 ? 300 : 1000))
      }
    }
    if (resources === undefined) throw lastErr

    this.resources.set(resources)
    if (!suppressAutoCreate && resources.length === 0) this.creating.set(true)
    this.initialLoadDone = true
    this.loading.set(false)
    this.loadError.set(false)
  }

  async doDeleteWorkspace() {
    this.deletingWorkspace.set(true)
    this.deleteWorkspaceError.set(null)
    try {
      await firstValueFrom(this.workspaceService.deleteWorkspace(this.name()))
      await this.router.navigate(["/"])
    } catch (err: unknown) {
      this.deleteWorkspaceError.set(httpErrorMessage(err, "Failed to delete workspace"))
    } finally {
      this.deletingWorkspace.set(false)
    }
  }
}
