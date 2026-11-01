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
import { KindIcon } from "../../core/kind-icon/kind-icon"
import { WorkspaceService } from "../../core/services/workspace.service"
import { httpErrorMessage } from "../../core/http-error"
import { techParts } from "../../core/tech-text"
import {
  Resource,
  ResourceKind,
  RESOURCE_KIND_COLORS,
  RESOURCE_KIND_LABELS,
} from "../../core/models/workspace.model"

// Kinds available to guests - Wordpress excluded (production data risk),
// Subscription excluded (requires existing topic).
// Sql, NoSql, ObjectStorage are only available as Api add-ons, not as standalone options.
// Workflow brings its own Api, so it is a sandbox of its own.
export const GUEST_KINDS: ResourceKind[] = ["Api", "Spa", "Workflow"]

// The kinds a guest can still add. The page's Add button and this panel both use it.
export function guestAvailableKinds(existingKinds: ResourceKind[]): ResourceKind[] {
  const existing = new Set(existingKinds)
  // The Workflow demo's Api takes the sandbox's one API hostname.
  if (existing.has("Workflow")) return []
  return GUEST_KINDS.filter((k) => !existing.has(k) && !(k === "Workflow" && existing.size > 0))
}

// What each demo card promises. Written as the outcome a guest sees, not the kind name.
const DEMO_CARDS: Partial<Record<ResourceKind, { title: string; desc: string; includes: string }>> =
  {
    Api: {
      title: "API with data",
      desc: "A live API on real AWS and Postgres storage, with its own Single Page App.",
      includes: "API · SPA · Postgres · DynamoDB · S3 · Redis",
    },
    Spa: {
      title: "Single Page App",
      desc: "A website that runs in the browser, on its own HTTPS address, calling its own API.",
      includes: "SPA · API",
    },
    Workflow: {
      title: "Crash-proof order",
      desc: "Unplug a server mid-order and watch Temporal finish the order anyway.",
      includes: "Temporal · Entra · 2 workers",
    },
  }

@Component({
  selector: "app-guest-create",
  imports: [KindIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!saving()) {
      <div class="picker">
        <h3>What do you want to try?</h3>
        <p class="lede">Each demo builds real infrastructure in about a minute.</p>

        @if (existingResources().length > 0) {
          <p class="existing">
            Already here:
            @for (r of existingResources(); track r.name) {
              <span class="chip"><app-kind-icon [kind]="r.kind" /> {{ labels[r.kind] }}</span>
            }
          </p>
        }

        <div class="cards">
          @for (k of availableKinds(); track k) {
            <button
              class="card"
              type="button"
              [class.selected]="selectedKind() === k"
              [attr.aria-pressed]="selectedKind() === k"
              (click)="selectedKind.set(k)"
            >
              <span class="tick">✓</span>
              <span class="disc" [style.--kind]="colors[k]"
                ><app-kind-icon class="kind-icon" [kind]="k"
              /></span>
              <span class="card-title">{{ demo[k]?.title ?? labels[k] }}</span>
              <span class="card-desc">
                <!-- prettier-ignore -->
                @for (part of techParts(demo[k]?.desc ?? ""); track $index) {@if (part.tech) {<b class="tech">{{ part.text }}</b>} @else {{{ part.text }}}}
              </span>
              <span class="card-includes">{{ demo[k]?.includes }}</span>
            </button>
          }
        </div>

        @if (selectedKind() === "Api") {
          <div class="addons">
            <div class="addons-head">
              <span class="addons-label">Your API comes with</span>
              <button type="button" class="dice" (click)="shuffle()">🎲 Surprise me</button>
            </div>
            <div class="toggles">
              @if (offerSpa()) {
                <span class="toggle on locked">
                  <app-kind-icon kind="Spa" /><span>Single Page App</span
                  ><span class="included">Included</span>
                </span>
              }
              @if (offerSql() || showSqlToggle()) {
                <button
                  type="button"
                  class="toggle"
                  [class.on]="withSql()"
                  [disabled]="withSql() && lastData()"
                  [attr.title]="
                    withSql() && lastData()
                      ? 'Every API keeps at least one place to store data'
                      : null
                  "
                  (click)="withSql.set(!withSql())"
                >
                  <app-kind-icon kind="Sql" /><span>Postgres</span><span class="switch"></span>
                </button>
              }
              @if (offerNoSql()) {
                <button
                  type="button"
                  class="toggle"
                  [class.on]="withNoSql()"
                  [disabled]="withNoSql() && lastData()"
                  [attr.title]="
                    withNoSql() && lastData()
                      ? 'Every API keeps at least one place to store data'
                      : null
                  "
                  (click)="withNoSql.set(!withNoSql())"
                >
                  <app-kind-icon kind="NoSql" /><span>DynamoDB</span><span class="switch"></span>
                </button>
              }
              @if (offerStorage()) {
                <button
                  type="button"
                  class="toggle"
                  [class.on]="withStorage()"
                  [disabled]="withStorage() && lastData()"
                  [attr.title]="
                    withStorage() && lastData()
                      ? 'Every API keeps at least one place to store data'
                      : null
                  "
                  (click)="withStorage.set(!withStorage())"
                >
                  <app-kind-icon kind="ObjectStorage" /><span>S3 bucket</span
                  ><span class="switch"></span>
                </button>
              }
              <button
                type="button"
                class="toggle"
                [class.on]="withCache()"
                (click)="withCache.set(!withCache())"
              >
                <app-kind-icon kind="Cache" /><span>Redis cache</span><span class="switch"></span>
              </button>
            </div>
            <p class="addons-note">Every API gets at least one place to store data.</p>
          </div>
        }

        @if (selectedKind()) {
          <p class="summary">
            <!-- prettier-ignore -->
            @for (part of techParts(planSummary()); track $index) {@if (part.tech) {<b class="tech">{{ part.text }}</b>} @else {{{ part.text }}}}
          </p>
        }
        @if (error()) {
          <p class="field-error">{{ error() }}</p>
        }

        <div class="actions">
          @if (availableKinds().length > 0) {
            <button
              class="build"
              [disabled]="!selectedKind() || !sandboxReady()"
              (click)="submit()"
            >
              {{ sandboxReady() ? "Build it" : "Setting up your sandbox…" }}
            </button>
          } @else {
            <p class="existing">Everything this sandbox can hold is already here.</p>
          }
          @if (allowCancel()) {
            <button type="button" class="secondary" (click)="cancelled.emit()">Cancel</button>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .picker {
        max-width: 760px;
        margin: 0 auto;
        padding: 1.5rem 0;
        text-align: center;
      }
      h3 {
        margin: 0;
        font-size: 1.4rem;
      }
      .lede {
        margin: 0.4rem 0 1.5rem;
        opacity: 0.7;
      }
      .existing {
        font-size: 0.85rem;
        opacity: 0.75;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        margin: 0 0.2rem;
        padding: 0.15rem 0.55rem;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 999px;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        text-align: left;
      }
      .card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1.25rem;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: linear-gradient(160deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
        color: inherit;
        cursor: pointer;
        transition:
          transform 0.15s,
          border-color 0.15s,
          box-shadow 0.15s;
      }
      .card:hover {
        transform: translateY(-2px);
        border-color: rgba(255, 255, 255, 0.25);
      }
      .card.selected {
        border-color: #818cf8;
        box-shadow:
          0 0 0 1px #818cf8,
          0 8px 30px rgba(99, 102, 241, 0.35);
      }
      .tick {
        position: absolute;
        top: 0.75rem;
        right: 0.75rem;
        width: 1.4rem;
        height: 1.4rem;
        border-radius: 50%;
        display: grid;
        place-items: center;
        font-size: 0.75rem;
        background: #6366f1;
        color: #fff;
        opacity: 0;
      }
      .card.selected .tick {
        opacity: 1;
      }
      .disc {
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, var(--kind) 22%, transparent);
        color: var(--kind);
        font-size: 1.3rem;
      }
      .card-title {
        font-size: 1.05rem;
        font-weight: 700;
      }
      .card-desc {
        font-size: 0.85rem;
        line-height: 1.4;
        opacity: 0.8;
      }
      .card-includes {
        margin-top: auto;
        font-size: 0.75rem;
        opacity: 0.55;
      }
      .addons {
        margin-top: 1.5rem;
      }
      .addons-head {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.6rem;
      }
      .dice {
        background: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: inherit;
        font-size: 0.8rem;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
      }
      .addons-note {
        margin: 0.5rem 0 0;
        font-size: 0.75rem;
        opacity: 0.55;
      }
      .toggle.locked {
        cursor: default;
      }
      /* The last data store is locked on. It stays bright, because it is on. */
      .toggle:disabled {
        opacity: 1;
        cursor: not-allowed;
      }
      .toggle span:not(.switch):not(.included) {
        white-space: nowrap;
      }
      .included {
        margin-left: auto;
        font-size: 0.7rem;
        opacity: 0.7;
      }
      .addons-label {
        display: block;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.6;
      }
      .toggles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 0.5rem;
      }
      .toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 0.75rem;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.03);
        color: inherit;
        font-size: 0.85rem;
        text-align: left;
        cursor: pointer;
      }
      .toggle.on {
        border-color: #818cf8;
        background: rgba(99, 102, 241, 0.12);
      }
      .switch {
        margin-left: auto;
        width: 30px;
        height: 18px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.2);
        position: relative;
        flex-shrink: 0;
      }
      .switch::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.15s;
      }
      .toggle.on .switch {
        background: #6366f1;
      }
      .toggle.on .switch::after {
        transform: translateX(12px);
      }
      .summary {
        margin: 1.25rem 0 0;
        font-size: 0.9rem;
        opacity: 0.85;
      }
      .actions {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.75rem;
        margin-top: 1rem;
      }
      .build {
        min-width: 12rem;
        text-align: center;
        justify-content: center;
        padding: 0.7rem 1.5rem;
        font-size: 1rem;
        font-weight: 700;
      }
      .field-error {
        color: #fca5a5;
      }
      @media (max-width: 600px) {
        .picker {
          padding: 0.5rem 0 1rem;
        }
        .cards,
        .toggles {
          grid-template-columns: 1fr;
        }
        .actions {
          flex-direction: column;
          align-items: stretch;
        }
        .build {
          width: 100%;
        }
      }
    `,
  ],
})
export class GuestCreate implements OnInit {
  readonly workspace = input.required<string>()
  readonly existingResources = input<Resource[]>([])
  // An empty sandbox has nothing to go back to, so its picker has no Cancel.
  readonly allowCancel = input(true)
  readonly created = output<void>()
  readonly cancelled = output<void>()
  readonly commitPlanChange = output<string[]>()

  private readonly workspaceService = inject(WorkspaceService)

  protected readonly guestKinds = GUEST_KINDS
  protected readonly labels = RESOURCE_KIND_LABELS
  protected readonly demo = DEMO_CARDS
  protected readonly colors = RESOURCE_KIND_COLORS

  protected readonly selectedKind = signal<ResourceKind | "">("")
  protected readonly saving = signal(false)
  protected readonly savedPlan = signal<string[]>([])
  protected readonly error = signal<string | null>(null)
  protected readonly withStorage = signal(false)
  protected readonly withCache = signal(false)
  protected readonly withSql = signal(false)
  protected readonly withNoSql = signal(false)
  // Always on, so a guest sees a page as well as JSON.
  protected readonly withSpa = signal(true)

  protected readonly availableKinds = computed(() =>
    guestAvailableKinds(this.existingResources().map((r) => r.kind)),
  )

  protected readonly offerStorage = computed(() => {
    if (this.selectedKind() !== "Api") return false
    return !this.existingResources().some((r) => r.kind === "ObjectStorage")
  })

  protected readonly offerSql = computed(
    () => this.selectedKind() === "Api" && !this.existingResources().some((r) => r.kind === "Sql"),
  )

  protected readonly offerNoSql = computed(
    () =>
      this.selectedKind() === "Api" && !this.existingResources().some((r) => r.kind === "NoSql"),
  )

  protected readonly showSqlToggle = computed(
    () => this.selectedKind() === "Api" && this.existingResources().some((r) => r.kind === "Sql"),
  )

  protected readonly offerSpa = computed(
    () => this.selectedKind() === "Api" && !this.existingResources().some((r) => r.kind === "Spa"),
  )

  protected readonly offerApi = computed(
    () => this.selectedKind() === "Spa" && !this.existingResources().some((r) => r.kind === "Api"),
  )

  protected readonly techParts = techParts

  protected readonly sandboxReady = computed(
    () => this.workspaceService.creatingGuest() !== this.workspace(),
  )

  // Data stores already in the sandbox count toward the one-store rule.
  private readonly hasExistingData = computed(() =>
    this.existingResources().some((r) => ["Sql", "NoSql", "ObjectStorage"].includes(r.kind)),
  )

  // True when only one data store is on, so turning it off is blocked.
  protected readonly lastData = computed(() => {
    if (this.hasExistingData()) return false
    const on = [this.withSql(), this.withNoSql(), this.withStorage()].filter(Boolean)
    return on.length <= 1
  })

  // Written as a sentence: "You'll get an API, a Postgres database and a Redis cache."
  protected readonly planSummary = computed(() => {
    const kind = this.selectedKind()
    let items: string[] = []
    if (kind === "Api") {
      items = [
        "an API",
        this.offerSpa() ? "a Single Page App" : "",
        this.withSql() ? "a Postgres database" : "",
        this.withNoSql() ? "a DynamoDB table" : "",
        this.withStorage() ? "an S3 bucket" : "",
        this.withCache() ? "a Redis cache" : "",
      ].filter(Boolean)
    } else if (kind === "Spa") {
      items = ["a Single Page App", this.offerApi() ? "an API behind it" : ""].filter(Boolean)
    } else if (kind === "Workflow") {
      items = ["a Temporal workflow", "two workers that sign in with Entra"]
    }
    if (items.length === 0) return ""
    const list =
      items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
    return `You'll get ${list}.`
  })

  ngOnInit(): void {
    // Auto-select Api so the configure options are visible immediately.
    if (this.availableKinds().includes("Api")) {
      this.selectedKind.set("Api")
    }
    this.shuffle()
  }

  // Picks a random mix, so each guest sees a different sandbox.
  // At least one data store is always on. The cache is on about half the time.
  protected shuffle(): void {
    const offered = [
      this.offerSql() ? this.withSql : null,
      this.offerNoSql() ? this.withNoSql : null,
      this.offerStorage() ? this.withStorage : null,
    ].filter((sig) => sig !== null)
    offered.forEach((sig) => sig.set(Math.random() < 0.5))
    const anyOn = offered.some((sig) => sig())
    if (!anyOn && offered.length && !this.hasExistingData()) {
      offered[Math.floor(Math.random() * offered.length)].set(true)
    }
    this.withCache.set(Math.random() < 0.5)
  }

  protected buildCommitPlan(kind: ResourceKind): string[] {
    const steps: string[] = []
    if (this.withStorage() && kind === "Api") steps.push("Object storage")
    if (this.withSql() && this.offerSql() && kind === "Api") steps.push("SQL database")
    if (this.withNoSql() && kind === "Api") steps.push("NoSQL database")
    if (this.withSpa() && kind === "Api" && this.offerSpa()) steps.push("Website")
    if (kind === "Spa" && this.offerApi()) steps.push("API")
    if (kind === "Workflow") steps.push("Workflow")
    steps.push(kind === "Spa" ? "Website" : "API")
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
      // in one request and one atomic Git commit server-side - no more
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
      this.error.set(httpErrorMessage(e, "Unexpected error creating resource"))
    } finally {
      this.saving.set(false)
      this.commitPlanChange.emit([])
    }
  }
}
