import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core"
import { firstValueFrom } from "rxjs"
import {
  Resource,
  ResourceKind,
  ResourceStatus,
  RESOURCE_KIND_LABELS,
  RESOURCE_KIND_COLORS,
  RESOURCE_KIND_ICONS,
} from "../../core/models/workspace.model"
import { WorkspaceService } from "../../core/services/workspace.service"
import { DynamicForm } from "../../create/dynamic-form/dynamic-form"

@Component({
  selector: "app-resource-card",
  imports: [DynamicForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "[class.expanded]": "expanded()" },
  template: `
    <div
      class="resource-card"
      [class.expanded]="expanded()"
      [style.border-left-color]="kindColor(resource().kind)"
    >
      <div class="resource-card-row" (click)="confirming.set(false); toggled.emit()">
        <span
          class="kind"
          [style.color]="kindColor(resource().kind)"
          [style.background-color]="kindBgColor(resource().kind)"
        >
          <span class="kind-icon">{{ kindIcon(resource().kind) }}</span
          >{{ kindLabel(resource().kind) }}</span
        >
        <span class="name" [title]="resource().name">{{ resource().name }}</span>
        <span
          class="status"
          [class.ready]="effectiveReady() && !isIntegrating()"
          [class.integrating]="isIntegrating()"
          [class.error]="status() != null && !status()!.synced"
          [class.unknown]="status() == null"
          [title]="statusTitle()"
        >
          {{
            status() == null
              ? "SYNCING"
              : isIntegrating()
                ? "INTEGRATING"
                : effectiveReady()
                  ? "READY"
                  : !status()!.synced
                    ? "ERROR"
                    : "PROVISIONING"
          }}
        </span>
        @if (statusMessage()) {
          <span
            class="status-message"
            [class.status-message-error]="status() != null && !status()!.synced"
            >{{ statusMessage() }}</span
          >
        }
        @if (previewUrl()) {
          <a
            class="preview-link"
            [class.preview-link--ready]="previewVisible()"
            [href]="previewUrl()"
            target="_blank"
            rel="noopener noreferrer"
            (click)="$event.stopPropagation()"
            title="Open preview"
            >↗ Open</a
          >
        }
        @if (canEdit()) {
          @if (confirming()) {
            <span class="delete-confirm">
              Delete?
              <button class="danger-sm" (click)="confirmDelete(); $event.stopPropagation()">
                Yes
              </button>
              <button
                class="secondary-sm"
                (click)="confirming.set(false); $event.stopPropagation()"
              >
                No
              </button>
            </span>
          } @else {
            <button
              class="delete-btn"
              title="Delete"
              (click)="confirming.set(true); $event.stopPropagation()"
            >
              Delete
            </button>
          }
        }
        <span class="expand-icon">{{ expanded() ? "▲" : "▼" }}</span>
      </div>

      @if (expanded()) {
        @if (integrationChips().length > 0) {
          <div class="connections-row">
            <span class="connections-label">Connections</span>
            @for (chip of integrationChips(); track chip) {
              <span class="integration-chip">{{ chip }}</span>
            }
          </div>
        }
        <div class="resource-edit">
          <app-dynamic-form
            mode="edit"
            [skipLiveValues]="status() == null"
            [workspace]="workspace()"
            [kind]="resource().kind"
            [resourceName]="resource().name"
            [readonly]="!canEdit()"
            [connectionsEditable]="canEditConnections()"
            (created)="saved.emit()"
            (cancelled)="toggled.emit()"
            (requestCreate)="createKind.emit($event)"
            (connectionsChanged)="onConnectionsChanged($event)"
          />
        </div>
        @if (pendingRefs() !== null) {
          <div style="padding: 1rem 1rem 0.5rem; display: flex; align-items: center; gap: 0.5rem">
            <button (click)="saveConnections()" [disabled]="connectionsSaving()">
              {{ connectionsSaving() ? "Saving…" : "Save integrations" }}
            </button>
            @if (connectionsUpdateError()) {
              <span class="field-error" style="margin: 0">{{ connectionsUpdateError() }}</span>
            }
          </div>
        }
      }
    </div>
  `,
})
export class ResourceCard {
  readonly resource = input.required<Resource>()
  readonly workspace = input.required<string>()
  readonly status = input<ResourceStatus | null>(null)
  /** Controlled by the parent — true when this card is the active expanded one. */
  readonly expanded = input<boolean>(false)
  readonly canEdit = input<boolean>(true)
  /** When true, the Resource Integrations section is editable (guest sandbox XApi only). */
  readonly canEditConnections = input<boolean>(false)
  /** False when a dependency (e.g. companion API for a SPA) is not yet ready. */
  readonly dependencyReady = input<boolean>(true)

  readonly toggled = output<void>()
  readonly deleted = output<string>()
  readonly saved = output<void>()
  readonly createKind = output<ResourceKind>()
  readonly previewReady = output<string>()

  protected readonly confirming = signal(false)
  protected readonly connectionsUpdateError = signal<string | null>(null)
  protected readonly pendingRefs = signal<{ withSql: boolean; withCache: boolean } | null>(null)
  protected readonly connectionsSaving = signal(false)
  protected readonly previewVisible = signal(false)
  // Set true after saving integrations — suppresses probe re-confirmation until
  // status cycles through not-ready (pod restarted), then clears itself.
  protected readonly awaitingRedeploy = signal(false)
  protected readonly effectiveReady = computed(
    () => (this.status()?.ready ?? false) && this.dependencyReady(),
  )
  protected readonly isIntegrating = computed(
    () =>
      this.effectiveReady() &&
      !!this.probeUrl() &&
      (!this.previewVisible() || this.awaitingRedeploy()),
  )
  private probeInterval: ReturnType<typeof setInterval> | null = null

  private readonly workspaceService = inject(WorkspaceService)
  private readonly destroyRef = inject(DestroyRef)

  constructor() {
    effect(() => {
      const ready = this.effectiveReady()
      const probeUrl = this.probeUrl()
      const awaiting = this.awaitingRedeploy()
      if (ready && probeUrl && !this.previewVisible() && !awaiting) {
        this.startProbing(probeUrl)
      } else if (ready && !probeUrl && this.isInternalHost() && !awaiting) {
        // Internal hosts use self-signed certs — browser can't probe them.
        // Mark visible immediately once Crossplane says ready.
        this.previewVisible.set(true)
        this.previewReady.emit(this.resource().name)
      } else if (!ready) {
        this.stopProbing()
        this.previewVisible.set(false)
        this.awaitingRedeploy.set(false) // status cycled — allow probing on next ready
      }
    })
    this.destroyRef.onDestroy(() => this.stopProbing())
  }

  // Internal (.local.lab) hosts use self-signed certs that the browser can't
  // verify, so a fetch-based probe will always throw. Skip it.
  private readonly isInternalHost = computed(() => {
    const host = this.resource().spec["host"] as string | undefined
    return host?.endsWith(".local.lab") ?? false
  })

  // Probe /readyz for XApi (returns 503 until all integrations are connected)
  // and /healthz for XSpa (nginx liveness only — API readiness is handled by
  // dependencyReady). Cloudflare error pages have no CORS header so they throw
  // rather than resolve, preventing dead links while TLS is still provisioning.
  private readonly probeUrl = computed(() => {
    const host = this.resource().spec["host"] as string | undefined
    if (!host) return null
    const kind = this.resource().kind
    if (kind !== "XSpa" && kind !== "XApi") return null
    if (host.endsWith(".local.lab")) return null
    return `https://${host}/${kind === "XApi" ? "readyz" : "healthz"}`
  })

  private startProbing(url: string): void {
    if (this.probeInterval) return // already running
    const probe = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" })
        if (res.ok) {
          this.previewVisible.set(true)
          this.previewReady.emit(this.resource().name)
          this.stopProbing()
        }
      } catch {
        // server not yet reachable — keep polling
      }
    }
    probe()
    this.probeInterval = setInterval(probe, 3000)
  }

  private stopProbing(): void {
    if (this.probeInterval) {
      clearInterval(this.probeInterval)
      this.probeInterval = null
    }
  }

  // Show the condition message inline when the resource is not ready and
  // there's something actionable to display (not just the default "Creating" noise).
  protected readonly previewUrl = computed(() => {
    if (!this.previewVisible()) return null
    const host = this.resource().spec["host"] as string | undefined
    if (!host) return null
    const kind = this.resource().kind
    if (kind !== "XSpa" && kind !== "XApi") return null
    if (host.endsWith(".local.lab")) return null
    const url = `https://${host}`
    return url
  })

  protected readonly statusTitle = computed(() => {
    const s = this.status()
    if (!s) return "ArgoCD is syncing your changes to the cluster…"
    if (s.ready && !this.dependencyReady()) return "Waiting for companion API to be ready…"
    if (s.ready) return "Up and running! 🚀"
    if (!s.synced) return s.message || "Something went wrong"
    return "Crossplane is wiring your resources together…"
  })

  protected readonly statusMessage = computed(() => {
    const s = this.status()
    if (!s || s.ready) return null
    const msg = s.message?.trim()
    if (!msg) return null
    // Filter out generic transient messages that aren't actionable.
    if (msg === "Creating" || msg === "Deleting") return null
    return msg
  })

  @HostListener("document:keydown.escape")
  onEscape() {
    if (this.confirming()) {
      this.confirming.set(false)
    }
  }

  kindLabel = (kind: string) =>
    RESOURCE_KIND_LABELS[kind as keyof typeof RESOURCE_KIND_LABELS] ?? kind
  kindColor = (kind: string) =>
    RESOURCE_KIND_COLORS[kind as keyof typeof RESOURCE_KIND_COLORS] ?? "#6366f1"
  kindBgColor = (kind: string) =>
    (RESOURCE_KIND_COLORS[kind as keyof typeof RESOURCE_KIND_COLORS] ?? "#6366f1") + "20"
  kindIcon = (kind: string) => RESOURCE_KIND_ICONS[kind as keyof typeof RESOURCE_KIND_ICONS] ?? ""

  integrationChips(): string[] {
    const spec = this.resource().spec
    const chips: string[] = []
    if ((spec["cache"] as Record<string, unknown> | undefined)?.["enabled"] === true)
      chips.push("Cache")
    if (spec["sqlRef"]) chips.push("SQL")
    if (spec["nosqlRef"]) chips.push("NoSQL")
    if (spec["objectStorageRefs"] || spec["objectStorageRef"]) chips.push("Object Storage")
    if (spec["topicRef"]) chips.push("Topic")
    if (spec["subscriptionRef"]) chips.push("Subscription")
    return chips
  }

  onConnectionsChanged(refs: { withSql: boolean; withCache: boolean }) {
    this.connectionsUpdateError.set(null)
    this.pendingRefs.set(refs)
  }

  async saveConnections() {
    const refs = this.pendingRefs()
    if (!refs) return
    this.connectionsSaving.set(true)
    this.connectionsUpdateError.set(null)
    try {
      await firstValueFrom(
        this.workspaceService.patchGuestResourceRefs(this.workspace(), this.resource().name, refs),
      )
      this.pendingRefs.set(null)
      // Immediately drop the preview link — the pod is about to restart.
      // awaitingRedeploy blocks the probe from re-confirming the old pod;
      // it clears itself once status cycles through not-ready.
      this.stopProbing()
      this.previewVisible.set(false)
      this.awaitingRedeploy.set(true)
    } catch {
      this.connectionsUpdateError.set("Failed to save connection changes.")
    } finally {
      this.connectionsSaving.set(false)
    }
  }

  confirmDelete() {
    this.confirming.set(false)
    this.deleted.emit(this.resource().name)
  }
}
