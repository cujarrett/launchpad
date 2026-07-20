import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core"
import { Resource, ResourceStatus } from "../../core/models/workspace.model"
import { WorkspaceService } from "../../core/services/workspace.service"

type RowStatus = "pending" | "active" | "done"

interface StatusRow {
  kind: "section" | "subsection" | "item"
  key: string
  label: string
  detail: string
  duration: string
  status: RowStatus
}

// Friendly labels for service binding and health check rows
// Compact node pipeline — mirrors main branch but at ~65% size
const PIPELINE_NODES = [
  { icon: "📦", label: "Committed" },
  { icon: "🔄", label: "Syncing" },
  { icon: "⚙️", label: "Provisioning" },
  { icon: "🔌", label: "Connecting" },
  { icon: "✨", label: "Live" },
]

const KIND_LABEL: Partial<Record<string, string>> = {
  Api: "API",
  Spa: "Frontend",
  NoSql: "NoSQL database",
  Sql: "SQL database",
  ObjectStorage: "Object storage",
  Cache: "Cache",
  Topic: "Topic",
  Subscription: "Subscription",
  Wordpress: "WordPress",
}

// What each XR creates — abstracted names, no cloud-vendor specifics
// Returns a faded inline detail for the subsection row describing what the XR manages.
// XR ready status covers all listed items — no separate rows needed.
function resourceDetail(r: { kind: string; spec: Record<string, unknown> }): string {
  const backend = (r.spec as { parameters?: { backend?: string } }).parameters?.backend
  switch (r.kind) {
    case "NoSql":
      return "NoSQL table · access role"
    case "ObjectStorage":
      return "Object store · access role"
    case "Sql":
      return backend === "public-cloud" ? "Database · access role" : "Database"
    case "Cache":
      return "Cache cluster"
    default:
      return ""
  }
}

const BINDING_LABEL: Record<string, string> = {
  sql: "SQL database",
  nosql: "NoSQL database",
  "object-storage": "Object storage",
  cache: "Cache",
}

// What each binding secret contains. nosql/object-storage are always real AWS
// resources, so they always carry an IAM role. sql/cache are in-cluster by
// default (backend: private-cloud) and only get an IAM role when explicitly
// switched to backend: public-cloud — must match the binding secret shape in
// platform/sql/composition.yaml and platform/cache/composition.yaml, not just
// guess based on resource kind.
const BINDING_DETAIL_PRIVATE: Record<string, string> = {
  sql: "host · port · username · password",
  cache: "host · port",
}
const BINDING_DETAIL_PUBLIC: Record<string, string> = {
  sql: "host · port · username · IAM role",
  nosql: "table · region · IAM role",
  "object-storage": "bucket · region · IAM role",
  cache: "host · port · IAM role",
}

function bindingDetail(
  binding: string,
  resources: { kind: string; spec: Record<string, unknown> }[],
): string {
  if (binding === "nosql" || binding === "object-storage") return BINDING_DETAIL_PUBLIC[binding]
  const kind = binding === "sql" ? "Sql" : binding === "cache" ? "Cache" : undefined
  const resource = resources.find((r) => r.kind === kind)
  const backend = (resource?.spec as { parameters?: { backend?: string } })?.parameters?.backend
  const table = backend === "public-cloud" ? BINDING_DETAIL_PUBLIC : BINDING_DETAIL_PRIVATE
  return table[binding] ?? "connection details"
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r > 0 ? `${m}m ${r}s` : `${m}m`
}

function sec(key: string, label: string, status: RowStatus, duration = ""): StatusRow {
  return { kind: "section", key, label, detail: "", duration, status }
}

function subsec(key: string, label: string, status: RowStatus, detail = ""): StatusRow {
  return { kind: "subsection", key, label, detail, duration: "", status }
}

function item(key: string, label: string, detail: string, status: RowStatus): StatusRow {
  return { kind: "item", key, label, detail, duration: "", status }
}

@Component({
  selector: "app-provisioning-pipeline",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length > 0) {
      <div class="status-list" [class.status-list--done]="isDone()">
        <div class="pipeline-mini" [class.pipeline-mini--done]="isDone()">
          @for (node of pipelineNodes; track node.label; let i = $index) {
            <div class="pm-stage">
              <div
                class="pm-node"
                [class.pm-node--done]="pipelineStates()[i] === 'done'"
                [class.pm-node--active]="pipelineStates()[i] === 'active'"
                [class.pm-node--pending]="pipelineStates()[i] === 'pending'"
              >
                <div class="pm-pulse"></div>
                <span class="pm-icon">{{ pipelineStates()[i] === "done" ? "✓" : node.icon }}</span>
              </div>
              <span class="pm-label" [class.pm-label--active]="pipelineStates()[i] === 'active'">{{
                node.label
              }}</span>
            </div>
            @if (i < pipelineNodes.length - 1) {
              <div
                class="pm-connector"
                [class.pm-connector--done]="pipelineStates()[i] === 'done'"
                [class.pm-connector--active]="pipelineStates()[i] === 'active'"
                [class.pm-connector--pending]="pipelineStates()[i] === 'pending'"
              ></div>
            }
          }
        </div>
        <div class="list-header">
          @if (totalDuration()) {
            <span class="total-duration"
              >{{ isDone() ? "Total" : "Elapsed" }}: {{ totalDuration() }}</span
            >
          }
          @if (isDone()) {
            <button class="collapse-btn" (click)="expanded.set(!expanded())">
              {{ expanded() ? "Collapse ▲" : "Details ▼" }}
            </button>
          }
        </div>
        @for (row of isDone() && expanded() ? fullDoneRows() : rows(); track row.key) {
          @if (row.kind === "section") {
            <div
              class="section-row"
              [class]="'row--' + row.status"
              [class.section-row--compact]="isDone() && !expanded()"
            >
              <span class="indicator">
                @if (row.status === "done") {
                  <span class="check">✓</span>
                } @else if (row.status === "active") {
                  <span class="spinner"></span>
                } @else {
                  <span class="dot"></span>
                }
              </span>
              <span class="section-label">{{ row.label }}</span>
              @if (row.duration) {
                <span class="section-duration">{{ row.duration }}</span>
              }
            </div>
          } @else if (row.kind === "subsection") {
            <div class="subsection-row" [class]="'row--' + row.status">
              <span class="indicator">
                @if (row.status === "done") {
                  <span class="check">✓</span>
                } @else if (row.status === "active") {
                  <span class="spinner"></span>
                } @else {
                  <span class="dot"></span>
                }
              </span>
              <span class="subsection-label">{{ row.label }}</span>
              @if (row.detail) {
                <span class="subsection-detail">{{ row.detail }}</span>
              }
            </div>
          } @else {
            <div class="item-row" [class]="'row--' + row.status">
              <span class="item-label">{{ row.label }}</span>
              <span class="item-detail">{{ row.detail }}</span>
            </div>
          }
        }
      </div>
    }
  `,
  styles: [
    `
      /* ── Status list ── */

      .status-list {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 0.75rem 1.25rem;
        margin-bottom: 1.5rem;
      }

      .status-list--done {
        opacity: 0.55;
        transition: opacity 0.2s;
      }

      .status-list--done:hover {
        opacity: 1;
      }

      .status-list--done:hover .row--done,
      .status-list--done:hover .total-duration,
      .status-list--done:hover .collapse-btn,
      .status-list--done:hover .section-duration,
      .status-list--done:hover .subsection-label,
      .status-list--done:hover .subsection-detail,
      .status-list--done:hover .item-label,
      .status-list--done:hover .item-detail {
        opacity: 1;
      }

      .list-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.25rem;
        min-height: 1.5rem;
      }

      .total-duration {
        font-size: 0.7rem;
        opacity: 0.35;
        font-variant-numeric: tabular-nums;
      }

      .collapse-btn {
        font-size: 0.7rem;
        opacity: 0.35;
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        padding: 0;
      }

      .collapse-btn:hover {
        opacity: 0.7;
      }

      /* ── Section rows ── */

      .section-row {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.45rem 0 0.2rem;
        margin-top: 0.15rem;
        transition: opacity 0.3s;
      }

      .row--pending {
        opacity: 0.3;
      }
      .row--done {
        opacity: 0.5;
      }
      .row--active {
        opacity: 1;
      }

      .section-label {
        font-size: 0.78rem;
        font-weight: 600;
        flex: 1;
      }

      .row--active .section-label {
        color: #c4b5fd;
      }

      .section-duration {
        font-size: 0.7rem;
        opacity: 0.45;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .row--active .section-duration {
        opacity: 0.65;
      }

      /* Compact done mode: tighter rows, lighter weight */
      .section-row--compact {
        padding: 0.28rem 0 0.1rem;
        margin-top: 0.05rem;
      }

      .section-row--compact .section-label {
        font-size: 0.72rem;
        font-weight: 400;
      }

      .section-row--compact .section-duration {
        font-size: 0.67rem;
      }

      /* ── Subsection rows ── */

      .subsection-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 0 0.05rem 1.6rem;
        margin-top: 0.1rem;
        transition: opacity 0.3s;
      }

      .subsection-label {
        font-size: 0.72rem;
        font-weight: 500;
        flex: 1;
        opacity: 0.85;
      }

      .row--active .subsection-label {
        color: #c4b5fd;
        opacity: 1;
      }

      .row--done .subsection-label {
        opacity: 0.65;
      }

      .subsection-detail {
        font-size: 0.68rem;
        opacity: 0.35;
        white-space: nowrap;
      }

      /* Subsection checkmarks are muted white — not green.
         Green is reserved for section-level milestones. */
      .subsection-row .check {
        color: rgba(255, 255, 255, 0.55);
        animation: none;
      }

      /* ── Item rows ── */

      .item-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.15rem 0 0.15rem 3rem;
        transition: opacity 0.3s;
      }

      .item-row::before {
        content: "";
        display: block;
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.3;
        flex-shrink: 0;
      }

      .row--active.item-row::before {
        opacity: 0.5;
      }

      .item-label {
        font-size: 0.73rem;
        flex: 1;
        opacity: 0.7;
      }

      .item-detail {
        font-size: 0.7rem;
        opacity: 0.35;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }

      .row--active .item-detail {
        opacity: 0.6;
      }

      .row--done .item-detail {
        color: #4ade80;
        opacity: 0.45;
      }

      /* ── Indicators ── */

      .indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        flex-shrink: 0;
      }

      .check {
        font-size: 0.68rem;
        font-weight: 700;
        color: #22c55e;
        animation: check-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }

      @keyframes check-pop {
        from {
          transform: scale(0);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }

      .dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.4;
      }

      .spinner {
        width: 11px;
        height: 11px;
        border-radius: 50%;
        border: 1.5px solid rgba(124, 58, 237, 0.25);
        border-top-color: #7c3aed;
        animation: spin 0.7s linear infinite;
        box-shadow: 0 0 5px rgba(124, 58, 237, 0.35);
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* ── Row entrance ── */

      @keyframes row-in {
        from {
          opacity: 0;
          transform: translateY(5px);
        }
        to {
          transform: none;
        }
      }

      .section-row,
      .subsection-row,
      .item-row {
        animation: row-in 0.22s ease-out backwards;
      }

      /* ── Active section: sweeping text shimmer ── */

      @keyframes shimmer {
        0% {
          background-position: 150% center;
        }
        100% {
          background-position: -150% center;
        }
      }

      .section-row.row--active .section-label {
        background: linear-gradient(90deg, #c4b5fd 20%, #ede9fe 50%, #c4b5fd 80%);
        background-size: 200% 100%;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: shimmer 2.8s ease-in-out infinite;
      }

      /* ── Pulsing detail text on in-progress items ── */

      @keyframes pulse-opacity {
        0%,
        100% {
          opacity: 0.6;
        }
        50% {
          opacity: 0.25;
        }
      }

      .row--active .item-detail {
        animation: pulse-opacity 2s ease-in-out infinite;
      }

      /* ── Mini pipeline nodes ── */

      .pipeline-mini {
        display: flex;
        align-items: flex-start;
        padding: 0.5rem 0 0.9rem;
        overflow: hidden;
        max-height: 100px;
        opacity: 1;
        transition:
          opacity 0.4s ease,
          max-height 0.5s ease,
          padding 0.5s ease;
      }

      .pipeline-mini--done {
        opacity: 0;
        max-height: 0;
        padding: 0;
        pointer-events: none;
      }

      .pm-stage {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.3rem;
        flex-shrink: 0;
        min-width: 44px;
      }

      .pm-node {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.72rem;
        position: relative;
        border: 1.5px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.05);
        transition:
          background 0.3s,
          border-color 0.3s;
      }

      .pm-node--done {
        background: rgba(34, 197, 94, 0.15);
        border-color: #22c55e;
        color: #22c55e;
        font-size: 0.62rem;
        font-weight: 700;
      }

      .pm-node--active {
        background: rgba(124, 58, 237, 0.2);
        border-color: #7c3aed;
        animation: pulse-node 1.8s ease-in-out infinite;
      }

      .pm-node--pending {
        opacity: 0.25;
      }

      @keyframes pulse-node {
        0%,
        100% {
          box-shadow: 0 0 6px rgba(124, 58, 237, 0.3);
        }
        50% {
          box-shadow: 0 0 16px rgba(124, 58, 237, 0.65);
        }
      }

      .pm-pulse {
        display: none;
      }

      .pm-node--active .pm-pulse {
        display: block;
        position: absolute;
        inset: -5px;
        border-radius: 50%;
        border: 1.5px solid rgba(124, 58, 237, 0.45);
        animation: pulse-ring 1.8s ease-out infinite;
        pointer-events: none;
      }

      @keyframes pulse-ring {
        0% {
          transform: scale(1);
          opacity: 0.7;
        }
        100% {
          transform: scale(1.6);
          opacity: 0;
        }
      }

      .pm-icon {
        line-height: 1;
      }

      .pm-label {
        font-size: 0.58rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.3;
        text-align: center;
        white-space: nowrap;
      }

      .pm-label--active {
        opacity: 0.7;
        color: #c4b5fd;
      }

      /* ── Mini pipeline connectors ── */

      .pm-connector {
        flex: 1;
        height: 1.5px;
        margin-top: 13px;
        align-self: flex-start;
        position: relative;
        overflow: hidden;
      }

      .pm-connector--done {
        background: #22c55e;
      }
      .pm-connector--pending {
        background: rgba(255, 255, 255, 0.1);
      }
      .pm-connector--active {
        background: rgba(124, 58, 237, 0.2);
      }

      .pm-connector--active::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: -20px;
        right: 0;
        background: repeating-linear-gradient(
          90deg,
          #7c3aed 0,
          #7c3aed 8px,
          transparent 8px,
          transparent 18px
        );
        animation: flow-dots 0.55s linear infinite;
      }

      @keyframes flow-dots {
        from {
          transform: translateX(0);
        }
        to {
          transform: translateX(20px);
        }
      }
    `,
  ],
})
export class ProvisioningPipeline implements OnInit, OnDestroy {
  readonly resources = input.required<Resource[]>()
  readonly statusMap = input.required<Partial<Record<string, ResourceStatus>>>()
  readonly podStatusMap = input<Partial<Record<string, ResourceStatus>>>({})
  readonly allPreviewsReady = input.required<boolean>()
  readonly commitPlan = input<string[]>([])
  readonly workspace = input<string>("")
  // Server-persisted phase times — wins over localStorage so any browser sees the same data.
  readonly initialPhaseTimes = input<Record<string, string>>({})
  readonly initialDoneTime = input<string | null>(null)
  // Earliest legitimate phase timestamp (epoch ms) — the workspace's own createdAt. Guards
  // against a stale localStorage entry from a previous workspace that happened to reuse the
  // same name (the guest name pool is finite; collisions across sessions do happen). No phase
  // can legitimately start before the workspace itself was created, so anything earlier is
  // discarded rather than trusted. null means "no bound" (non-guest workspaces).
  readonly minPhaseTime = input<number | null>(null)

  private readonly workspaceService = inject(WorkspaceService)
  protected readonly expanded = signal(false)

  // Timestamps: phaseIdx → ms when that phase first became active
  private readonly phaseTimes = signal<Partial<Record<number, number>>>({})
  private readonly doneTime = signal<number | null>(null)
  private readonly now = signal(Date.now())
  private ticker?: ReturnType<typeof setInterval>

  // Tracks which workspace's data currently occupies phaseTimes/doneTime — null means
  // "not yet initialized" (distinct from the default "" workspace value) so the reset
  // effect below doesn't wipe the very first load.
  private trackedWorkspace: string | null = null

  private lsKey(suffix: string): string {
    return `pipeline-${suffix}-${this.workspace()}`
  }

  // Restores an immediate fallback from localStorage — used on first mount and again
  // whenever the workspace changes underneath a reused component instance, since
  // ngOnInit only runs once per component lifetime but the router can swap `workspace`
  // without destroying this component (only the `:name` route param changes).
  private restoreFromLocalStorage(): void {
    if (Object.keys(this.initialPhaseTimes()).length === 0) {
      try {
        const raw = localStorage.getItem(this.lsKey("times"))
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Record<number, number>>
          this.phaseTimes.set(this.clampPhaseTimes(parsed))
        }
      } catch {
        /* ignore */
      }
    }
    if (!this.initialDoneTime()) {
      try {
        const done = Number(localStorage.getItem(this.lsKey("done")))
        const min = this.minPhaseTime()
        if (done > 0 && (min === null || done >= min)) this.doneTime.set(done)
      } catch {
        /* ignore */
      }
    }
  }

  // Drops any phase timestamp earlier than minPhaseTime (the workspace's real createdAt).
  // Applied wherever phaseTimes can be populated from a source other than "record it now"
  // (localStorage, server data) — both can carry a stale value from an earlier workspace
  // that reused the same name.
  private clampPhaseTimes(times: Partial<Record<number, number>>): Partial<Record<number, number>> {
    const min = this.minPhaseTime()
    if (min === null) return times
    const clamped: Partial<Record<number, number>> = {}
    for (const [k, v] of Object.entries(times)) {
      if (v !== undefined && v >= min) clamped[Number(k)] = v
    }
    return clamped
  }

  private persistLocal(times: Partial<Record<number, number>>): void {
    const ws = this.workspace()
    if (!ws) return
    try {
      localStorage.setItem(this.lsKey("times"), JSON.stringify(times))
    } catch {
      /* ignore */
    }
  }

  constructor() {
    // Reset phase-timing state when the displayed workspace actually changes. The router
    // reuses this component instance across `workspaces/:name` navigations (only the param
    // changes, no destroy/recreate), so without this reset the phaseTimes/doneTime signals
    // from whichever workspace was viewed previously leak into the newly-displayed one —
    // showing wrong per-step durations, and a hidden Total once totalDuration()'s own
    // minPhaseTime guard (correctly) filters the stale values out entirely.
    effect(() => {
      const ws = this.workspace()
      if (this.trackedWorkspace !== null && this.trackedWorkspace !== ws) {
        this.phaseTimes.set({})
        this.doneTime.set(null)
        this.expanded.set(false)
        this.restoreFromLocalStorage()
      }
      this.trackedWorkspace = ws
    })
    // Record start time the first time each phase becomes active, persist to server + localStorage.
    // Phase 5 is the "done" sentinel — skip it so it can't pollute totalDuration.
    effect(() => {
      const phase = this.phaseIdx()
      if (phase < 0 || phase === 5) return
      this.phaseTimes.update((t) => {
        if (t[phase] !== undefined) return t
        const updated = { ...t, [phase]: Date.now() }
        this.persistLocal(updated)
        const ws = this.workspace()
        if (ws) this.workspaceService.recordGuestPhase(ws, String(phase))
        return updated
      })
    })
    // If the commit plan clears while resources are still empty, the commit failed or was
    // cancelled. Reset phase 0 so the pipeline doesn't show "Committed → Syncing" for a
    // commit that never produced any resources.
    let planWasActive = false
    effect(() => {
      const planLen = this.commitPlan().length
      if (planLen > 0) {
        planWasActive = true
        return
      }
      if (!planWasActive) return
      planWasActive = false
      if (this.resources().length === 0) {
        this.phaseTimes.update((t) => {
          if (t[0] === undefined) return t
          const updated = { ...t }
          delete updated[0]
          const ws = this.workspace()
          if (ws) {
            try {
              localStorage.removeItem(this.lsKey("times"))
            } catch {
              /* ignore */
            }
          }
          return updated
        })
      }
    })
    // Record and persist completion time once.
    effect(() => {
      if (this.isDone() && this.doneTime() === null) {
        const done = Date.now()
        this.doneTime.set(done)
        const ws = this.workspace()
        if (ws) {
          try {
            localStorage.setItem(this.lsKey("done"), String(done))
          } catch {
            /* ignore */
          }
          this.workspaceService.recordGuestPhase(ws, "", true)
        }
      }
    })
    // Apply server-side phase times reactively — initialPhaseTimes arrives async (after
    // getWorkspaces() resolves) so ngOnInit reads it too early. This effect re-fires when
    // the input updates and overwrites any localStorage data with the ground truth.
    effect(() => {
      const serverTimes = this.initialPhaseTimes()
      if (Object.keys(serverTimes).length === 0) return
      const parsed: Partial<Record<number, number>> = {}
      for (const [k, v] of Object.entries(serverTimes)) {
        const ms = new Date(v).getTime()
        if (!isNaN(ms)) parsed[Number(k)] = ms
      }
      this.phaseTimes.set(this.clampPhaseTimes(parsed))
    })
    effect(() => {
      const serverDone = this.initialDoneTime()
      if (!serverDone) return
      const ms = new Date(serverDone).getTime()
      if (!isNaN(ms)) this.doneTime.set(ms)
    })
  }

  ngOnInit(): void {
    // localStorage as an immediate fallback — server data arrives later via effects above.
    this.restoreFromLocalStorage()
    this.ticker = setInterval(() => this.now.set(Date.now()), 1000)
  }

  ngOnDestroy(): void {
    clearInterval(this.ticker)
  }

  // Duration string for a phase. Reads signals so it must be called from a computed.
  private dur(phase: number): string {
    const times = this.phaseTimes()
    const start = times[phase]
    if (start === undefined) return ""
    // Phases can be skipped on page load (e.g. page opened mid-provisioning means
    // phase 1 is never recorded). Scan forward for the nearest recorded phase time
    // so completed rows don't tick up indefinitely.
    let nextStart: number | undefined
    for (let p = phase + 1; p <= 4; p++) {
      if (times[p] !== undefined) {
        nextStart = times[p]
        break
      }
    }
    const end = nextStart ?? this.doneTime() ?? this.now()
    return fmt(Math.max(0, end - start))
  }

  // Phase index drives all section states.
  // 0=committing 1=syncing 2=provisioning 3=binding 4=health 5=done
  private readonly phaseIdx = computed(() => {
    if (this.commitPlan().length > 0) return 0
    const resources = this.resources()
    if (resources.length === 0) return -1
    const statusMap = this.statusMap()
    if (resources.some((r) => !statusMap[r.name])) return 1
    if (!resources.every((r) => statusMap[r.name]?.ready)) return 2
    const pods = Object.values(this.podStatusMap())
    if (pods.some((p) => p?.initContainers?.some((ic) => !ic.completed))) return 3
    if (!this.allPreviewsReady()) return 4
    return 5
  })

  // Done if SSE confirms all ready, OR if we already know doneTime (restored from
  // localStorage/server on refresh) — avoids the "wrong active stage" flash while SSE catches up.
  protected readonly isDone = computed(() => this.phaseIdx() === 5 || this.doneTime() !== null)

  protected readonly pipelineNodes = PIPELINE_NODES

  protected readonly pipelineStates = computed<Array<"done" | "active" | "pending">>(() => {
    const phase = this.phaseIdx()
    const committed = this.phaseTimes()[0] !== undefined
    // Map phase to active node index; -1 = all done
    let active: number
    if (phase === 5) active = -1
    else if (phase >= 0) active = phase
    else if (committed)
      active = 1 // after commit, before resources appear = syncing
    else active = 0
    return PIPELINE_NODES.map((_, i) => {
      if (active === -1) return "done"
      if (i < active) return "done"
      if (i === active) return "active"
      return "pending"
    })
  })

  protected readonly totalDuration = computed(() => {
    const times = this.phaseTimes()
    const starts = Object.values(times).filter((v): v is number => v !== undefined)
    if (starts.length === 0) return null
    // Defensive second layer: clampPhaseTimes already filters at every write site, but a bad
    // value slipping in from an untested path shouldn't produce a nonsensical total.
    const min = this.minPhaseTime()
    const validStarts = min === null ? starts : starts.filter((v) => v >= min)
    if (validStarts.length === 0) return null
    const earliest = Math.min(...validStarts)
    const end = this.isDone() ? (this.doneTime() ?? this.now()) : this.now()
    return fmt(end - earliest)
  })

  protected readonly rows = computed<StatusRow[]>(() => {
    const phase = this.phaseIdx()
    const rows: StatusRow[] = []
    const resources = this.resources()
    const statusMap = this.statusMap()

    // ── Commit to Git ──────────────────────────────────────────────────────
    // Must come before the phase === -1 guard: when commit finishes and SSE
    // hasn't delivered resources yet, phase is -1 but we still want this row.
    const plan = this.commitPlan()
    if (plan.length > 0) {
      rows.push(sec("s-commit", "Committing manifests to Git", "active", this.dur(0)))
      return rows
    }
    // Show committed row if we have a timestamp OR if resources exist (proving a commit happened).
    // phase >= 1 means resources appeared, so the commit definitely occurred even if we joined
    // mid-provisioning and never recorded the timestamp.
    if (this.phaseTimes()[0] !== undefined || phase >= 1) {
      rows.push(sec("s-commit", "Committed manifests to Git", "done", this.dur(0)))
    }

    if (phase === -1) return rows

    // ── Syncing to Kubernetes ──────────────────────────────────────────────
    const syncActive = phase === 1
    rows.push(sec("s-sync", "Syncing to Kubernetes", syncActive ? "active" : "done", this.dur(1)))
    if (syncActive) return rows

    // ── Provisioning infrastructure ────────────────────────────────────────
    const allReady = resources.every((r) => statusMap[r.name]?.ready)
    const provActive = phase === 2
    rows.push(
      sec("s-prov", "Provisioning infrastructure", allReady ? "done" : "active", this.dur(2)),
    )
    // Only expand detail rows while this phase is active
    if (provActive) {
      for (const r of resources) {
        const s = statusMap[r.name]
        const rStatus: RowStatus = !s ? "pending" : s.ready ? "done" : "active"
        rows.push(subsec(r.name, KIND_LABEL[r.kind] ?? r.kind, rStatus, resourceDetail(r)))
      }
      return rows
    }

    if (!allReady) return rows

    // Derived once — needed by both binding and health sections.
    const hasApi = resources.some((r) => r.kind === "Api")
    const hasSpa = resources.some((r) => r.kind === "Spa")
    const hasCloudBindings = resources.some((r) => {
      if (r.kind === "NoSql" || r.kind === "ObjectStorage") return true
      const backend = (r.spec as { parameters?: { backend?: string } }).parameters?.backend
      return (r.kind === "Sql" || r.kind === "Cache") && backend === "public-cloud"
    })

    // ── Service bindings ───────────────────────────────────────────────────
    const pods = Object.values(this.podStatusMap())
    const apiPod = pods.find((p) => p?.initContainers?.length)
    if (apiPod?.initContainers?.length) {
      const allBound = apiPod.initContainers.every((ic) => ic.completed)
      rows.push(sec("s-bind", "Service bindings", allBound ? "done" : "active", this.dur(3)))
      // Only expand while this phase is active
      if (phase === 3) {
        for (const ic of apiPod.initContainers) {
          const label = BINDING_LABEL[ic.binding] ?? ic.binding
          const detail = bindingDetail(ic.binding, resources)
          rows.push(
            item(
              `bind-${ic.binding}`,
              label,
              ic.completed ? detail : `mounting ${detail}…`,
              ic.completed ? "done" : "active",
            ),
          )
        }
        return rows
      }
      if (!allBound) return rows
    }

    // ── Container startup ──────────────────────────────────────────────────
    if (hasApi || hasSpa) {
      const healthDone = this.allPreviewsReady()
      rows.push(
        sec(
          "s-health",
          "Waiting for container readiness probe",
          healthDone ? "done" : "active",
          this.dur(4),
        ),
      )
      // Only expand while this phase is active
      if (!healthDone) {
        if (hasApi) rows.push(item("h-api", "API", "polling…", "active"))
        if (hasSpa) rows.push(item("h-spa", "Frontend", "polling…", "active"))
      }
    }

    return rows
  })

  // Full retrospective view: all stages with sub-items expanded.
  // Only used when isDone() && expanded().
  protected readonly fullDoneRows = computed<StatusRow[]>(() => {
    const resources = this.resources()
    const statusMap = this.statusMap()
    const rows: StatusRow[] = []

    rows.push(sec("s-commit", "Committed manifests to Git", "done", this.dur(0)))

    rows.push(sec("s-sync", "Syncing to Kubernetes", "done", this.dur(1)))

    rows.push(sec("s-prov", "Provisioning infrastructure", "done", this.dur(2)))
    for (const r of resources) {
      const s = statusMap[r.name]
      rows.push(
        subsec(
          r.name,
          KIND_LABEL[r.kind] ?? r.kind,
          s?.ready ? "done" : "active",
          resourceDetail(r),
        ),
      )
    }

    const hasApi = resources.some((r) => r.kind === "Api")
    const hasSpa = resources.some((r) => r.kind === "Spa")
    const hasCloudBindings = resources.some((r) => {
      if (r.kind === "NoSql" || r.kind === "ObjectStorage") return true
      const backend = (r.spec as { parameters?: { backend?: string } }).parameters?.backend
      return (r.kind === "Sql" || r.kind === "Cache") && backend === "public-cloud"
    })

    const pods = Object.values(this.podStatusMap())
    const apiPod = pods.find((p) => p?.initContainers?.length)
    if (apiPod?.initContainers?.length) {
      rows.push(sec("s-bind", "Service bindings", "done", this.dur(3)))
      if (hasCloudBindings) {
        rows.push(item("h-spire", "Issuing workload identity", "identity issued", "done"))
      }
      for (const ic of apiPod.initContainers) {
        const label = BINDING_LABEL[ic.binding] ?? ic.binding
        const detail = bindingDetail(ic.binding, resources)
        rows.push(item(`bind-${ic.binding}`, label, detail, "done"))
      }
    }

    if (hasApi || hasSpa) {
      rows.push(sec("s-health", "Waiting for container readiness probe", "done", this.dur(4)))
      if (hasApi) rows.push(item("h-api", "API", "ready", "done"))
      if (hasSpa) rows.push(item("h-spa", "Frontend", "ready", "done"))
    }

    return rows
  })
}
