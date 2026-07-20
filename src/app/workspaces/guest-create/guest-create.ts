import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  OnInit,
  output,
  signal,
} from "@angular/core"
import { inject } from "@angular/core"
import { firstValueFrom } from "rxjs"
import { HttpErrorResponse } from "@angular/common/http"
import { WorkspaceService } from "../../core/services/workspace.service"
import {
  Resource,
  ResourceKind,
  RESOURCE_KIND_ICONS,
  RESOURCE_KIND_LABELS,
} from "../../core/models/workspace.model"

// Kinds available to guests — Wordpress excluded (production data risk),
// Subscription excluded (requires existing topic).
// Sql, NoSql, ObjectStorage are only available as Api add-ons, not as standalone options.
export const GUEST_KINDS: ResourceKind[] = ["Api", "Spa"]

const GUEST_KIND_DESC: Record<ResourceKind, string> = {
  Api: "REST API with HTTPS, cache, and database add-ons.",
  Spa: "Static frontend app served over HTTPS.",
  Sql: "Relational database.",
  NoSql: "NoSQL key-value store. Fast lookups, flexible schemas.",
  ObjectStorage: "Object storage for files, assets, and blobs.",
  Cache: "",
  Topic: "",
  Subscription: "",
  Wordpress: "",
}

@Component({
  selector: "app-guest-create",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="guest-create-panel">
      @if (!saving()) {
        <h3>What do you want to build?</h3>

        @if (existingResources().length > 0) {
          <div class="existing-section">
            <span class="section-label">Already in this workspace:</span>
            <div class="existing-chips">
              @for (r of existingResources(); track r.name) {
                <span class="chip">{{ icons[r.kind] }} {{ labels[r.kind] }}</span>
              }
            </div>
          </div>
        }

        @if (availableKinds().length === 0) {
          <p class="all-full">All resource types are already in this workspace.</p>
        }
        <div class="kind-grid">
          @for (k of availableKinds(); track k) {
            <button
              class="kind-card"
              type="button"
              [class.selected]="selectedKind() === k"
              (click)="selectedKind.set(k)"
            >
              <span class="kind-icon">{{ icons[k] }}</span>
              <span class="kind-name">{{ labels[k] }}</span>
              <span class="kind-desc">{{ kindDesc[k] }}</span>
            </button>
          }
        </div>

        @if (selectedKind() === "Api") {
          <div class="options-section">
            <span class="options-label">Configure API</span>
            <div class="options-grid">
              @if (showSqlToggle()) {
                <button
                  type="button"
                  class="option-card"
                  [class.active]="withSql()"
                  (click)="withSql.set(!withSql())"
                >
                  <span class="option-icon">🗄️</span>
                  <div class="option-body">
                    <span class="option-title">Connect to existing SQL database</span>
                    <span class="option-desc"
                      >Wire your API to the SQL database already in this workspace.</span
                    >
                  </div>
                  <span class="option-toggle" [class.on]="withSql()"></span>
                </button>
              }
              @if (offerSql()) {
                <button
                  type="button"
                  class="option-card"
                  [class.active]="withSql()"
                  (click)="withSql.set(!withSql())"
                >
                  <span class="option-icon">🗄️</span>
                  <div class="option-body">
                    <span class="option-title">Also provision SQL database</span>
                    <span class="option-desc"
                      >Creates a relational database and wires it to your API.</span
                    >
                  </div>
                  <span class="option-toggle" [class.on]="withSql()"></span>
                </button>
              }
              @if (offerNoSql()) {
                <button
                  type="button"
                  class="option-card"
                  [class.active]="withNoSql()"
                  (click)="withNoSql.set(!withNoSql())"
                >
                  <span class="option-icon">📋</span>
                  <div class="option-body">
                    <span class="option-title">Also provision NoSQL database</span>
                    <span class="option-desc"
                      >Creates a key-value store and wires it to your API.</span
                    >
                  </div>
                  <span class="option-toggle" [class.on]="withNoSql()"></span>
                </button>
              }
              @if (offerStorage()) {
                <button
                  type="button"
                  class="option-card"
                  [class.active]="withStorage()"
                  (click)="withStorage.set(!withStorage())"
                >
                  <span class="option-icon">🗂️</span>
                  <div class="option-body">
                    <span class="option-title">Also provision object storage</span>
                    <span class="option-desc"
                      >A managed store for files and blobs, wired to your API.</span
                    >
                  </div>
                  <span class="option-toggle" [class.on]="withStorage()"></span>
                </button>
              }
              <button
                type="button"
                class="option-card"
                [class.active]="withCache()"
                (click)="withCache.set(!withCache())"
              >
                <span class="option-icon">⏩</span>
                <div class="option-body">
                  <span class="option-title">Add cache</span>
                  <span class="option-desc">Cache wired to your API via service binding.</span>
                </div>
                <span class="option-toggle" [class.on]="withCache()"></span>
              </button>
              @if (offerSpa()) {
                <button
                  type="button"
                  class="option-card"
                  [class.active]="withSpa()"
                  (click)="withSpa.set(!withSpa())"
                >
                  <span class="option-icon">🌐</span>
                  <div class="option-body">
                    <span class="option-title">
                      Also create a SPA
                      <span class="recommended-badge">Recommended</span>
                    </span>
                    <span class="option-desc">Provisions a static frontend wired to this API.</span>
                  </div>
                  <span class="option-toggle" [class.on]="withSpa()"></span>
                </button>
              }
            </div>
          </div>
        }

        @if (selectedKind() === "Spa" && offerApi()) {
          <div class="options-section">
            <span class="options-label">Configure SPA</span>
            <div class="options-grid">
              <div class="option-card required">
                <span class="option-icon">⚡</span>
                <div class="option-body">
                  <span class="option-title"
                    >API backend <span class="required-badge">Required for this demo</span></span
                  >
                  <span class="option-desc"
                    >Needed to serve your workspace name to the Demo SPA.</span
                  >
                </div>
              </div>
            </div>
          </div>
        }

        @if (error()) {
          <p class="field-error">{{ error() }}</p>
        }

        <div class="form-actions">
          @if (availableKinds().length > 0) {
            <button [disabled]="!selectedKind()" (click)="submit()">Create</button>
          }
          <button type="button" class="secondary" (click)="cancelled.emit()">Cancel</button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .guest-create-panel {
        padding: 1.5rem;
      }
      h3 {
        margin: 0 0 1rem;
      }
      .existing-section {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-bottom: 1.25rem;
      }
      .section-label {
        font-size: 0.8rem;
        opacity: 0.6;
        white-space: nowrap;
      }
      .existing-chips {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
      }
      .chip {
        font-size: 0.8rem;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
      }
      .kind-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 0.75rem;
        margin-bottom: 1rem;
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
        position: relative;
        transition:
          border-color 0.15s,
          background 0.15s;
      }
      .kind-card:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.25);
      }
      .kind-card.selected {
        border-color: #7c3aed;
        background: rgba(124, 58, 237, 0.15);
      }

      .all-full {
        margin: 0 0 1rem;
        font-size: 0.875rem;
        opacity: 0.55;
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
      .options-section {
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        margin-top: 0.25rem;
        padding-top: 1rem;
        margin-bottom: 1rem;
      }
      .options-label {
        display: block;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.45;
        margin-bottom: 0.75rem;
      }
      .options-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.5rem;
      }
      .option-card {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        cursor: pointer;
        text-align: left;
        transition:
          border-color 0.15s,
          background 0.15s;
        color: inherit;
      }
      .option-icon {
        font-size: 1.2rem;
        line-height: 1;
        flex-shrink: 0;
      }
      .option-card.required {
        cursor: default;
        opacity: 0.8;
      }
      .required-badge {
        display: inline-block;
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--purple, #a78bfa);
        background: rgba(124, 58, 237, 0.15);
        border: 1px solid rgba(124, 58, 237, 0.3);
        border-radius: 4px;
        padding: 1px 5px;
        vertical-align: middle;
        margin-left: 6px;
      }
      .option-card:hover {
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(255, 255, 255, 0.2);
      }
      .option-card.active {
        border-color: rgba(124, 58, 237, 0.6);
        background: rgba(124, 58, 237, 0.1);
      }
      .options-grid .option-card {
        animation: card-in 0.25s ease both;
      }
      .options-grid .option-card:nth-child(1) {
        animation-delay: 0.05s;
      }
      .options-grid .option-card:nth-child(2) {
        animation-delay: 0.1s;
      }
      .options-grid .option-card:nth-child(3) {
        animation-delay: 0.15s;
      }
      .options-grid .option-card:nth-child(4) {
        animation-delay: 0.2s;
      }
      .options-grid .option-card:nth-child(5) {
        animation-delay: 0.25s;
      }
      @keyframes card-in {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .recommended-badge {
        display: inline-block;
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #a78bfa;
        background: rgba(124, 58, 237, 0.15);
        border: 1px solid rgba(124, 58, 237, 0.3);
        border-radius: 4px;
        padding: 1px 5px;
        vertical-align: middle;
        margin-left: 6px;
      }
      .option-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .option-title {
        font-size: 0.875rem;
        font-weight: 500;
      }
      .option-desc {
        font-size: 0.75rem;
        opacity: 0.55;
        line-height: 1.4;
      }
      .option-toggle {
        flex-shrink: 0;
        width: 36px;
        height: 20px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.15);
        position: relative;
        transition: background 0.2s;
      }
      .option-toggle::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.2s;
      }
      .option-toggle.on {
        background: #7c3aed;
      }
      .option-toggle.on::after {
        transform: translateX(16px);
      }
    `,
  ],
})
export class GuestCreate implements OnInit {
  readonly workspace = input.required<string>()
  readonly existingResources = input<Resource[]>([])
  readonly created = output<void>()
  readonly cancelled = output<void>()
  readonly commitPlanChange = output<string[]>()

  private readonly workspaceService = inject(WorkspaceService)

  protected readonly guestKinds = GUEST_KINDS
  protected readonly labels = RESOURCE_KIND_LABELS
  protected readonly icons = RESOURCE_KIND_ICONS
  protected readonly kindDesc = GUEST_KIND_DESC

  protected readonly selectedKind = signal<ResourceKind | "">("")
  protected readonly saving = signal(false)
  protected readonly savedPlan = signal<string[]>([])
  protected readonly error = signal<string | null>(null)
  protected readonly withStorage = signal(false)
  protected readonly withCache = signal(false)
  protected readonly withSql = signal(false)
  protected readonly withNoSql = signal(false)
  protected readonly withSpa = signal(false)

  protected readonly availableKinds = computed(() => {
    const existing = new Set(this.existingResources().map((r) => r.kind))
    return this.guestKinds.filter((k) => !existing.has(k))
  })

  protected readonly offerStorage = computed(() => {
    if (this.selectedKind() !== "Api") return false
    return !this.existingResources().some((r) => r.kind === "ObjectStorage")
  })

  protected readonly offerSql = computed(
    () =>
      this.selectedKind() === "Api" && !this.existingResources().some((r) => r.kind === "Sql"),
  )

  protected readonly offerNoSql = computed(
    () =>
      this.selectedKind() === "Api" && !this.existingResources().some((r) => r.kind === "NoSql"),
  )

  protected readonly showSqlToggle = computed(
    () => this.selectedKind() === "Api" && this.existingResources().some((r) => r.kind === "Sql"),
  )

  protected readonly offerSpa = computed(
    () =>
      this.selectedKind() === "Api" && !this.existingResources().some((r) => r.kind === "Spa"),
  )

  protected readonly offerApi = computed(
    () =>
      this.selectedKind() === "Spa" && !this.existingResources().some((r) => r.kind === "Api"),
  )

  ngOnInit(): void {
    // Auto-select Api so the configure options are visible immediately.
    if (this.availableKinds().includes("Api")) {
      this.selectedKind.set("Api")
    }
  }

  protected buildCommitPlan(kind: ResourceKind): string[] {
    const steps: string[] = []
    if (this.withStorage() && kind === "Api") steps.push("Object storage")
    if (this.withSql() && this.offerSql() && kind === "Api") steps.push("SQL database")
    if (this.withNoSql() && kind === "Api") steps.push("NoSQL database")
    if (this.withSpa() && kind === "Api" && this.offerSpa()) steps.push("Frontend")
    if (kind === "Spa" && this.offerApi()) steps.push("API")
    steps.push(kind === "Api" ? "API" : "Frontend")
    return steps
  }

  protected async submit(): Promise<void> {
    const kind = this.selectedKind()
    if (!kind) return
    const plan = this.buildCommitPlan(kind)
    this.savedPlan.set(plan)
    this.commitPlanChange.emit(plan)
    this.saving.set(true)
    this.error.set(null)
    try {
      // All requested resources (add-ons plus the API/SPA itself) are created
      // in one request and one atomic Git commit server-side — no more
      // sequential round trips per add-on, and no risk of a partially created
      // workspace if this request is interrupted.
      await firstValueFrom(
        this.workspaceService.createGuestResourceBatch(this.workspace(), kind, {
          withCache: this.withCache(),
          withSql: this.withSql(),
          withNoSql: this.withNoSql() && kind === "Api",
          withStorage: this.withStorage() && kind === "Api",
          withSpa: this.withSpa() && kind === "Api" && this.offerSpa(),
          withApi: kind === "Spa" && this.offerApi(),
        }),
      )
      this.created.emit()
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        this.error.set(e.error ?? e.message)
      } else {
        this.error.set("Unexpected error creating resource")
      }
    } finally {
      this.saving.set(false)
      this.commitPlanChange.emit([])
    }
  }
}
