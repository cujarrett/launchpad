import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from "@angular/core"
import { HttpErrorResponse } from "@angular/common/http"
import { Router, RouterLink } from "@angular/router"
import { FormsModule } from "@angular/forms"
import { firstValueFrom } from "rxjs"
import { WorkspaceService } from "../core/services/workspace.service"
import { RoleService } from "../core/services/role.service"
import { Workspace } from "../core/models/workspace.model"

const GUEST_MAX = 5

const GUEST_WORDS_1 = [
  "atomic",
  "banana",
  "blazing",
  "chrome",
  "cosmic",
  "disco",
  "electric",
  "exploding",
  "frozen",
  "fuzzy",
  "golden",
  "haunted",
  "jazzy",
  "laser",
  "magic",
  "midnight",
  "neon",
  "phantom",
  "quantum",
  "rubber",
  "shadow",
  "silver",
  "turbo",
  "velvet",
  "wandering",
]

const GUEST_WORDS_2 = [
  "anvil",
  "burrito",
  "cactus",
  "cannon",
  "cassette",
  "catapult",
  "factory",
  "hamster",
  "jelly",
  "llama",
  "napkin",
  "penguin",
  "pickle",
  "pirate",
  "pretzel",
  "rocket",
  "spatula",
  "spreadsheet",
  "submarine",
  "taco",
  "toaster",
  "tornado",
  "volcano",
  "waffle",
  "wizard",
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickGuestName(used: Set<string>, avoidWord1 = "", avoidWord2 = ""): string {
  const words1 = avoidWord1 ? GUEST_WORDS_1.filter((w) => w !== avoidWord1) : GUEST_WORDS_1
  const words2 = avoidWord2 ? GUEST_WORDS_2.filter((w) => w !== avoidWord2) : GUEST_WORDS_2
  for (let i = 0; i < 100; i++) {
    const name = `${pickRandom(words1)}-${pickRandom(words2)}`
    if (!used.has(name)) return name
  }
  return `${pickRandom(words1)}-${pickRandom(words2)}`
}

@Component({
  selector: "app-workspaces",
  imports: [RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      @if (!roleService.isContributor() && !pickingGuestName() && !savingGuestWorkspace()) {
        <div class="sandbox-cta">
          @if (guestCount() >= guestMax) {
            <p class="muted" style="font-size:0.85rem">{{ sandboxFullMessage() }}</p>
          } @else {
            <button class="sandbox-btn" (click)="startGuestNamePicker()">🧪 Try the Sandbox</button>
            <p class="sandbox-tagline">Real infrastructure. Powered by Kubernetes and AWS.</p>
            @if (guestCount() > 0) {
              <span class="muted" style="font-size:0.7rem"
                >{{ slotsRemaining() }}/{{ guestMax }} slots available</span
              >
            }
          }
        </div>
      }

      <div class="page-header">
        <div>
          <h1>Workspaces</h1>
        </div>
        <div style="display:flex;gap:0.5rem">
          @if (roleService.isContributor() && !creatingWorkspace() && !savingGuestWorkspace()) {
            <button (click)="creatingWorkspace.set(true)">+ New Workspace</button>
          }
        </div>
      </div>

      @if (creatingWorkspace()) {
        <form class="create-panel" (ngSubmit)="submitNewWorkspace()">
          <label>
            Workspace name
            <input
              #nameInput
              type="text"
              [value]="newWorkspaceName()"
              (input)="newWorkspaceName.set(nameInput.value)"
              placeholder="my-workspace"
              pattern="[a-z0-9][-a-z0-9]*[a-z0-9]|[a-z0-9]"
              required
              autofocus
            />
          </label>
          @if (createWorkspaceError()) {
            <p class="field-error">{{ createWorkspaceError() }}</p>
          }
          <div class="form-actions">
            <button type="submit" [disabled]="savingWorkspace() || !newWorkspaceName()">
              {{ savingWorkspace() ? "Creating…" : "Create" }}
            </button>
            <button type="button" class="secondary" (click)="cancelNewWorkspace()">Cancel</button>
          </div>
        </form>
      }

      @if (pickingGuestName()) {
        <div class="create-panel guest-picker">
          <p class="picker-label">Pick your sandbox name:</p>
          <div class="name-badge-wrap">
            <div class="name-badge">{{ guestNameSuggestion() }}</div>
            @if (!savingGuestWorkspace()) {
              <button type="button" class="reroll-btn" (click)="rerollGuestName()">
                🎲 try another
              </button>
            }
          </div>
          @if (createGuestError()) {
            <p class="field-error">{{ createGuestError() }}</p>
          }
          <div class="form-actions" style="justify-content:center">
            <button
              type="button"
              [disabled]="savingGuestWorkspace()"
              (click)="launchGuestWorkspace()"
            >
              {{ savingGuestWorkspace() ? "Creating Demo Workspace…" : "Launch!" }}
            </button>
            <button type="button" class="secondary" (click)="cancelGuestPicker()">Cancel</button>
          </div>
        </div>
      }

      @if (loading()) {
        <p class="muted">Loading...</p>
      } @else if (error()) {
        <p class="field-error">{{ error() }}</p>
      } @else if (myWorkspaces().length === 0 && guestWorkspaces().length === 0) {
        <p class="muted">No workspaces found.</p>
      } @else {
        @if (guestWorkspaces().length > 0) {
          <p class="section-label">🧪 Active sandboxes</p>
          <div class="card-grid">
            @for (workspace of guestWorkspaces(); track workspace.name) {
              <a class="workspace-tile guest-tile" [routerLink]="['/workspaces', workspace.name]">
                <span class="guest-badge">🧪 sandbox</span>
                {{ workspace.name.replace("guest-", "") }}
                @if (workspace.expiresAt) {
                  <span class="guest-ttl" [class.expiring]="isExpiringSoon(workspace.expiresAt)">
                    ⏱ {{ countdown(workspace.expiresAt) }}
                  </span>
                }
              </a>
            }
          </div>
        }
        @if (myWorkspaces().length > 0) {
          <p class="section-label">Matt's Workspaces</p>
          <div class="card-grid">
            @for (workspace of myWorkspaces(); track workspace.name) {
              <a class="workspace-tile" [routerLink]="['/workspaces', workspace.name]">
                {{ workspace.name }}
              </a>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .guest-tile {
        background: linear-gradient(
          135deg,
          rgba(139, 92, 246, 0.12) 0%,
          rgba(59, 130, 246, 0.08) 100%
        );
        border: 1px dashed #7c3aed;
        position: relative;
      }
      .section-label {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.55;
        font-weight: 600;
        margin: 1.25rem 0 0.6rem;
      }
      .section-label:first-of-type {
        margin-top: 0;
      }
      .guest-badge {
        display: block;
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #7c3aed;
        font-weight: 700;
        margin-bottom: 0.2rem;
      }
      .guest-ttl {
        display: block;
        font-size: 0.75rem;
        margin-top: 0.25rem;
        opacity: 0.75;
      }
      .guest-ttl.expiring {
        color: #f59e0b;
        font-weight: 600;
      }
      .guest-picker {
        border: 1px dashed #7c3aed;
        background: rgba(139, 92, 246, 0.06);
      }
      .picker-label {
        margin: 0 0 0.75rem;
        font-size: 0.9rem;
        opacity: 0.8;
      }
      .name-badge-wrap {
        text-align: center;
        margin-bottom: 1.25rem;
      }
      .name-badge {
        display: inline-block;
        font-size: 1.5rem;
        font-weight: 700;
        padding: 0.5rem 1.5rem;
        border: 2px solid #7c3aed;
        border-radius: 8px;
        background: rgba(124, 58, 237, 0.12);
        letter-spacing: 0.02em;
        margin-bottom: 0.5rem;
      }
      .reroll-btn {
        display: block;
        margin: 0 auto;
        background: none;
        border: none;
        color: #a78bfa;
        font-size: 0.85rem;
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
      }
      .reroll-btn:hover {
        color: #c4b5fd;
      }
      .icon-btn {
        padding: 0.2rem 0.4rem;
        font-size: 1rem;
        background: none;
        border: none;
        cursor: pointer;
      }
      .sandbox-cta {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 2rem 0 1.75rem;
        margin-bottom: 0.25rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        text-align: center;
      }
      .sandbox-btn {
        font-size: 1.05rem;
        font-weight: 700;
        padding: 0.8rem 2.25rem;
        background: transparent;
        color: #e2e8f0;
        border: 2px solid transparent;
        background-clip: padding-box;
        position: relative;
        transition: color 0.2s;
      }
      .sandbox-btn::before {
        content: "";
        position: absolute;
        inset: -2px;
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
        transition:
          inset 0.2s,
          padding 0.2s;
      }
      .sandbox-btn:hover::before {
        inset: -4px;
        padding: 4px;
      }
      .sandbox-btn:hover {
        color: #c4b5fd;
      }
      .sandbox-tagline {
        font-size: 0.88rem;
        opacity: 0.65;
        margin: 0;
        max-width: 560px;
        line-height: 1.55;
      }
      @keyframes border-run {
        0% {
          background-position: 0% 50%;
        }
        100% {
          background-position: 300% 50%;
        }
      }
    `,
  ],
})
export class Workspaces implements OnInit, OnDestroy {
  private readonly workspaceService = inject(WorkspaceService)
  private readonly router = inject(Router)
  protected readonly roleService = inject(RoleService)

  protected readonly workspaces = signal<Workspace[]>([])
  protected readonly myWorkspaces = computed(() => this.workspaces().filter((w) => !w.isGuest))
  protected readonly guestWorkspaces = computed(() =>
    this.workspaces()
      .filter((w) => w.isGuest)
      .sort((a, b) => {
        const at = a.expiresAt ? new Date(a.expiresAt).getTime() : 0
        const bt = b.expiresAt ? new Date(b.expiresAt).getTime() : 0
        return bt - at
      }),
  )
  protected readonly loading = signal(true)
  protected readonly error = signal<string | null>(null)

  // Contributor workspace creation
  protected readonly creatingWorkspace = signal(false)
  protected readonly newWorkspaceName = signal("")
  protected readonly savingWorkspace = signal(false)
  protected readonly createWorkspaceError = signal<string | null>(null)

  // Guest workspace creation
  protected readonly pickingGuestName = signal(false)
  protected readonly guestNameSuggestion = signal("")
  protected readonly savingGuestWorkspace = signal(false)
  protected readonly createGuestError = signal<string | null>(null)

  // Tick signal drives countdown re-renders without zone dependency.
  private readonly tick = signal(0)
  private tickInterval?: ReturnType<typeof setInterval>

  protected readonly guestMax = GUEST_MAX
  protected readonly guestCount = computed(() => this.workspaces().filter((w) => w.isGuest).length)
  protected readonly slotsRemaining = computed(() => this.guestMax - this.guestCount())
  protected readonly sandboxFullMessage = computed(() => {
    return `All ${this.guestMax} sandbox slots are in use — try again in a few minutes`
  })

  async ngOnInit() {
    this.tickInterval = setInterval(() => this.tick.set(this.tick() + 1), 1000)
    try {
      this.workspaces.set(await firstValueFrom(this.workspaceService.getWorkspaces()))
    } catch {
      this.error.set("Could not load workspaces — check API connectivity and reload.")
    } finally {
      this.loading.set(false)
    }
  }

  ngOnDestroy() {
    clearInterval(this.tickInterval)
  }

  protected countdown(expiresAt: string): string {
    this.tick() // reactive dependency — re-runs every tick
    const remaining = new Date(expiresAt).getTime() - Date.now()
    if (remaining <= 0) return "Expired"
    const m = Math.floor(remaining / 60_000)
    const s = Math.floor((remaining % 60_000) / 1000)
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  protected isExpiringSoon(expiresAt: string): boolean {
    this.tick()
    return new Date(expiresAt).getTime() - Date.now() < 120_000
  }

  // ── Contributor workspace ──────────────────────────────

  cancelNewWorkspace() {
    this.creatingWorkspace.set(false)
    this.newWorkspaceName.set("")
    this.createWorkspaceError.set(null)
  }

  async submitNewWorkspace() {
    const name = this.newWorkspaceName().trim()
    if (!name) return
    this.savingWorkspace.set(true)
    this.createWorkspaceError.set(null)
    try {
      await firstValueFrom(this.workspaceService.createWorkspace(name))
      const updated = await firstValueFrom(this.workspaceService.getWorkspaces())
      this.workspaces.set(updated)
      this.cancelNewWorkspace()
    } catch (err: unknown) {
      const msg =
        err instanceof HttpErrorResponse
          ? typeof err.error === "string" && err.error.trim()
            ? err.error.trim()
            : `HTTP ${err.status}`
          : err instanceof Error
            ? err.message
            : "Failed to create workspace"
      this.createWorkspaceError.set(msg)
    } finally {
      this.savingWorkspace.set(false)
    }
  }

  // ── Guest workspace ────────────────────────────────────

  private usedGuestNames(): Set<string> {
    return new Set(
      this.workspaces()
        .filter((w) => w.isGuest)
        .map((w) => w.name.replace("guest-", "")),
    )
  }

  startGuestNamePicker() {
    this.guestNameSuggestion.set(pickGuestName(this.usedGuestNames()))
    this.createGuestError.set(null)
    this.pickingGuestName.set(true)
  }

  rerollGuestName() {
    const [w1, w2] = this.guestNameSuggestion().split("-")
    this.guestNameSuggestion.set(pickGuestName(this.usedGuestNames(), w1, w2))
  }

  cancelGuestPicker() {
    this.pickingGuestName.set(false)
    this.createGuestError.set(null)
  }

  async launchGuestWorkspace() {
    this.savingGuestWorkspace.set(true)
    this.createGuestError.set(null)
    try {
      const result = await firstValueFrom(
        this.workspaceService.createGuestWorkspace(this.guestNameSuggestion()),
      )
      this.router.navigate(["/workspaces", result.name])
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        // Name was just taken — reload workspace list so the filter is fresh, then reroll.
        try {
          this.workspaces.set(await firstValueFrom(this.workspaceService.getWorkspaces()))
        } catch {
          /* ignore reload errors */
        }
        this.rerollGuestName()
        this.createGuestError.set("That name was just taken — try another one!")
      } else {
        const msg =
          err instanceof HttpErrorResponse
            ? typeof err.error === "string" && err.error.trim()
              ? err.error.trim()
              : `HTTP ${err.status}`
            : err instanceof Error
              ? err.message
              : "Failed to create sandbox workspace"
        this.createGuestError.set(msg)
      }
    } finally {
      this.savingGuestWorkspace.set(false)
    }
  }
}
