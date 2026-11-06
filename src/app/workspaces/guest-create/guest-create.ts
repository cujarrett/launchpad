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
import { toObservable } from "@angular/core/rxjs-interop"
import { filter, firstValueFrom } from "rxjs"
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
// WorkflowSpace brings its own Api, so it is a sandbox of its own.
// The API demo already includes a Single Page App, so the Spa has no card of its own.
export const GUEST_KINDS: ResourceKind[] = ["Api", "WorkflowSpace"]

// The kinds a guest can still add. The page's Add button and this panel both use it.
export function guestAvailableKinds(existingKinds: ResourceKind[]): ResourceKind[] {
  const existing = new Set(existingKinds)
  // The WorkflowSpace demo's Api takes the sandbox's one API hostname.
  if (existing.has("WorkflowSpace")) return []
  return GUEST_KINDS.filter(
    (k) => !existing.has(k) && !(k === "WorkflowSpace" && existing.size > 0),
  )
}

// What each demo card promises. Written as the outcome a guest sees, not the kind name.
const DEMO_CARDS: Partial<Record<ResourceKind, { title: string; desc: string; includes: string }>> =
  {
    Api: {
      title: "App with real data",
      // Data stores use general names. Temporal is the one product a guest sees by name.
      desc: "A website and API, wired to every kind of data store.",
      includes: "Website + API + SQL + NoSQL + Object storage + Cache",
    },
    WorkflowSpace: {
      title: "Durable workflow",
      desc: "A business process, kept running through a worker crash.",
      includes: "API + Temporal + Crash test",
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
        <p class="lede">Each demo builds real infrastructure in under a minute.</p>

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

        @if (error()) {
          <p class="field-error">{{ error() }}</p>
        }

        <div class="actions">
          @if (availableKinds().length > 0) {
            <button class="build" [disabled]="!selectedKind()" (click)="submit()">Build it</button>
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
        border-color: transparent;
        box-shadow: 0 8px 30px rgba(99, 102, 241, 0.35);
      }
      /* The same running border as the home page's Try the Sandbox button. */
      .card.selected::before {
        content: "";
        position: absolute;
        inset: -1px;
        border-radius: inherit;
        padding: 2px;
        background: linear-gradient(90deg, #7c3aed, #a78bfa, #38bdf8, #7c3aed);
        background-size: 300% 100%;
        -webkit-mask:
          linear-gradient(#fff 0 0) content-box,
          linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        animation: border-run 2.8s linear infinite;
        pointer-events: none;
      }
      @keyframes border-run {
        to {
          background-position: 300% 50%;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .card.selected::before {
          animation: none;
        }
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
        .cards {
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
  protected readonly availableKinds = computed(() =>
    guestAvailableKinds(this.existingResources().map((r) => r.kind)),
  )

  protected readonly techParts = techParts

  // A fast pick can beat the sandbox's own commit. Build waits for it behind the rollout.
  private readonly sandboxReady$ = toObservable(
    computed(() => this.workspaceService.creatingGuest() !== this.workspace()),
  )

  ngOnInit(): void {
    // Starts selected, so Build it works on the first click.
    if (this.availableKinds().includes("Api")) {
      this.selectedKind.set("Api")
    }
  }

  protected buildCommitPlan(kind: ResourceKind): string[] {
    if (kind === "WorkflowSpace") return ["Workflow space", "API"]
    return ["Object storage", "SQL database", "NoSQL database", "Website", "API"]
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
      // False only if this page closed first, such as a failed sandbox create sending the guest home.
      const ready = await firstValueFrom(this.sandboxReady$.pipe(filter(Boolean)), {
        defaultValue: false,
      })
      if (!ready) {
        this.commitPlanChange.emit([])
        return
      }
      // All requested resources (add-ons plus the API/SPA itself) are created
      // in one request and one atomic Git commit server-side - no more
      // sequential round trips per add-on, and no risk of a partially created
      // workspace if this request is interrupted.
      await firstValueFrom(
        this.workspaceService.createGuestResourceBatch(this.workspace(), kind, {
          // The workflow demo takes no add-ons. The API ignores these for it.
          withCache: kind === "Api",
          withSql: kind === "Api",
          withNoSql: kind === "Api",
          withStorage: kind === "Api",
          withSpa: kind === "Api",
        }),
      )
      this.created.emit()
    } catch (e) {
      // A successful build's plan stays open. The page clears it once the files load.
      this.commitPlanChange.emit([])
      this.error.set(httpErrorMessage(e, "Unexpected error creating resource"))
    } finally {
      this.saving.set(false)
    }
  }
}
