import { Component, computed, DestroyRef, inject, input, signal } from "@angular/core"
import { ResourceStatus } from "../../core/models/workspace.model"

interface Step {
  name: string
  status: string
  worker: string
}

interface OrderView {
  workflow: { steps: Step[]; handoffs: number; done: boolean }
  plain: { worker: string; steps: string[]; stuck: boolean }
  payments: { attempts: number; charges: number; plainCharged: boolean }
  events: { time: string; text: string }[] | null
}

// A step the workflow moved after its worker died. Pod names.
interface Move {
  step: string
  from: string
  to: string
}

const STEP_NAMES = ["charge", "pack", "ship", "email"]

// Polling stops once both copies have settled, or after this long.
const MAX_POLL_MS = 2 * 60 * 1000

const MARK: Record<string, string> = { done: "✓", running: "●", stuck: "✗", waiting: "·" }

@Component({
  selector: "app-try-workflow",
  template: `
    <section class="panel">
      <div class="head">
        <h3>Crash a worker mid-order</h3>
        <details class="why" [open]="!everPlaced()">
          <summary>Why this matters</summary>
          <ul>
            <li>A worker is a server that does an order's steps: charge, pack, ship, email.</li>
            <li>Servers crash, restart and get redeployed all the time.</li>
            <li>Without Temporal, a crash mid-order can charge a customer and never ship.</li>
            <li>With Temporal, another worker carries on, and the card is charged once.</li>
          </ul>
        </details>
      </div>
      <p class="bridge">
        Your Workflow runs on Temporal, which records every step as it happens. Each order you place
        runs twice, side by side: once without Temporal and once with it.
      </p>

      <div class="bar">
        <ol class="steps">
          <li [class.active]="stage() === 1" [class.done]="stage() > 1">
            <span class="num">{{ stage() > 1 ? "✓" : "1" }}</span>
            @if (stage() === 1) {
              <button class="go" (click)="placeOrder()" [disabled]="busy()">
                {{ order() ? "Place another order" : "Place an order" }}
              </button>
            } @else {
              <span>Order placed</span>
            }
          </li>
          <li [class.active]="stage() === 2" [class.done]="stage() > 2">
            <span class="num">{{ stage() > 2 ? "✓" : "2" }}</span>
            @if (stage() > 2) {
              <span>{{ unpluggedLabel() }} unplugged</span>
            } @else {
              <button class="danger" (click)="unplug()" [disabled]="stage() < 2 || !canUnplug()">
                Unplug {{ busyPod() ? labelOf(busyPod()) : "its worker" }}
              </button>
            }
          </li>
          <li [class.active]="stage() === 3">
            <span class="num">3</span>
            <span>Watch</span>
          </li>
        </ol>
        <div class="workers">
          @for (w of workers(); track w.pod) {
            <span class="worker" [class.online]="w.online" [class.busy]="w.pod === busyPod()">
              <span class="dot"></span>{{ w.label }}
              <span class="state">{{
                w.online ? (w.pod === busyPod() ? "working" : "online") : "offline"
              }}</span>
            </span>
          }
        </div>
      </div>
      @if (hint()) {
        <p class="hint">{{ hint() }}</p>
      }
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      <div class="track">
        <h4>Without Temporal</h4>
        <ol class="chips">
          @for (s of plainSteps(); track $index) {
            <li [class]="s">
              <span class="chip">{{ stepNames[$index] }} {{ mark(s) }}</span>
            </li>
          }
        </ol>
        <p class="caption" [class.bad]="order()?.plain?.stuck">{{ plainCaption() }}</p>
      </div>

      <div class="track">
        <h4>With Temporal</h4>
        <ol class="chips">
          @for (s of temporalSteps(); track s.name) {
            <li [class]="s.status">
              <span class="chip"
                >{{ s.name }} {{ moveOf(s.name) ? "↻ " : "" }}{{ mark(s.status) }}</span
              >
              <span class="who">{{ whoText(s) }}</span>
            </li>
          }
        </ol>
        <p class="caption" [class.good]="order()?.workflow?.done">{{ temporalCaption() }}</p>
      </div>

      @if (result()) {
        <p class="result">{{ result() }}</p>
      }

      @if (order()?.events?.length) {
        <details class="history">
          <summary>Event history from Temporal</summary>
          <ol>
            @for (e of order()!.events; track $index) {
              <li>
                <time>{{ e.time.slice(11, 19) }}</time> {{ eventText(e.text) }}
              </li>
            }
          </ol>
        </details>
      }
    </section>
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
      .why {
        margin-top: 0.4rem;
      }
      h3 {
        margin: 0;
        font-size: 1rem;
      }
      h4 {
        margin: 0 0 0.4rem;
        font-size: 0.8rem;
        opacity: 0.7;
      }
      .why {
        font-size: 0.8rem;
      }
      .why summary {
        cursor: pointer;
        opacity: 0.7;
      }
      .why ul {
        margin: 0.5rem 0 0;
        padding-left: 1.1rem;
        line-height: 1.5;
      }
      .bridge {
        margin: 0.5rem 0 1rem;
        font-size: 0.85rem;
        opacity: 0.8;
      }
      .bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .steps {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .steps li {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.85rem;
        opacity: 0.45;
      }
      .steps li.active,
      .steps li.done {
        opacity: 1;
      }
      .steps li.done {
        color: #4ade80;
      }
      .num {
        width: 1.4rem;
        height: 1.4rem;
        border-radius: 50%;
        border: 1px solid currentColor;
        display: grid;
        place-items: center;
        font-size: 0.7rem;
      }
      .steps li.active .num {
        border-color: #7c3aed;
        background: #7c3aed;
        color: #fff;
      }
      .steps button {
        border: 1px solid transparent;
        color: #fff;
        font-weight: 600;
      }
      .steps button.go {
        background: #6366f1;
      }
      .steps button.danger {
        background: #dc2626;
      }
      .steps button:disabled {
        background: transparent;
        border-color: rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.35);
        cursor: not-allowed;
      }
      .workers {
        display: flex;
        gap: 0.5rem;
      }
      .worker {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.25rem 0.6rem;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        font-size: 0.75rem;
        opacity: 0.6;
      }
      .worker.online {
        opacity: 1;
      }
      .worker.busy {
        border-color: #7c3aed;
      }
      .dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: #ef4444;
      }
      .worker.online .dot {
        background: #4ade80;
      }
      .state {
        opacity: 0.6;
      }
      .hint {
        margin: 0.5rem 0 0;
        font-size: 0.8rem;
        color: #c4b5fd;
      }
      .error {
        color: #fca5a5;
        font-size: 0.8rem;
      }
      .track {
        margin-top: 1rem;
        padding: 0.75rem;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
      }
      .chips {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .chips li {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.15rem;
      }
      .chip {
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        font-size: 0.8rem;
        opacity: 0.5;
      }
      .chips li.done .chip {
        border-color: #4ade80;
        color: #4ade80;
        opacity: 1;
      }
      .chips li.running .chip {
        border-color: #a78bfa;
        color: #c4b5fd;
        opacity: 1;
      }
      .chips li.stuck .chip,
      .chips li.interrupted .chip {
        border-color: #f87171;
        color: #fca5a5;
        opacity: 1;
      }
      .who {
        font-size: 0.7rem;
        opacity: 0.6;
        min-height: 1em;
      }
      .caption {
        margin: 0.5rem 0 0;
        font-size: 0.8rem;
        opacity: 0.8;
      }
      .caption.bad {
        color: #fca5a5;
        opacity: 1;
      }
      .caption.good {
        color: #4ade80;
        opacity: 1;
      }
      .result {
        margin: 0.75rem 0 0;
        font-size: 0.9rem;
        font-weight: 600;
      }
      .history {
        margin-top: 0.75rem;
        font-size: 0.8rem;
      }
      .history summary {
        cursor: pointer;
        opacity: 0.7;
      }
      .history ol {
        padding-left: 1.2rem;
      }
      .history time {
        opacity: 0.5;
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class TryWorkflow {
  // The Api's public host, such as demo2-api.mattjarrett.dev.
  readonly host = input.required<string>()
  // Pod names start with this, so the panel can find the workers in the pod stream.
  readonly apiName = input.required<string>()
  readonly podStatusMap = input.required<Partial<Record<string, ResourceStatus>>>()

  protected readonly stepNames = STEP_NAMES
  protected readonly order = signal<OrderView | null>(null)
  protected readonly error = signal<string | null>(null)
  protected readonly busy = signal(false)
  protected readonly everPlaced = signal(false)
  protected readonly unpluggedLabel = signal("")
  private readonly unplugged = signal(false)
  // The server keeps only each step's last worker, so the page remembers the earlier one.
  private readonly moves = signal<Move[]>([])

  private orderId = ""
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private pollStarted = 0

  // Pods this page has seen Ready. A rollout replaces pods that never got there,
  // and those are left out, so only real workers get a card.
  private readonly seenReady = new Set<string>()

  protected readonly workers = computed(() =>
    Object.values(this.podStatusMap())
      .filter((p): p is ResourceStatus => !!p && p.name.startsWith(this.apiName() + "-"))
      .filter((p) => {
        if (p.ready) this.seenReady.add(p.name)
        return this.seenReady.has(p.name)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p, i) => ({
        pod: p.name,
        label: `Worker ${String.fromCharCode(65 + i)}`,
        online: p.ready,
      })),
  )

  protected readonly busyPod = computed(
    () => this.order()?.workflow.steps.find((s) => s.status === "running")?.worker ?? "",
  )

  private readonly restarting = computed(() => this.workers().find((w) => !w.online))

  // Both workers online, so the order has somewhere to go.
  protected readonly canUnplug = computed(
    () =>
      !!this.busyPod() && this.workers().filter((w) => w.online).length >= 2 && !this.unplugged(),
  )

  // 1: place an order. 2: unplug its worker. 3: watch.
  protected readonly stage = computed(() => {
    const o = this.order()
    if (!o || o.workflow.done) return 1
    return this.unplugged() || o.workflow.handoffs > 0 ? 3 : 2
  })

  protected readonly hint = computed(() => {
    const running = this.order()?.workflow.steps.find((s) => s.status === "running")
    if (this.stage() !== 2 || !running) return ""
    if (!this.canUnplug())
      return `${this.restarting()?.label ?? "The other worker"} is restarting. Wait for it.`
    return `${this.labelOf(running.worker)} is on ${running.name}. Unplug it before the order finishes.`
  })

  protected readonly plainSteps = computed(() => {
    const p = this.order()?.plain
    if (!p) return STEP_NAMES.map(() => "waiting")
    // A stuck copy's running step will never finish.
    return p.steps.map((s) => (p.stuck && s === "running" ? "stuck" : s))
  })

  protected readonly temporalSteps = computed(
    () =>
      this.order()?.workflow.steps ??
      STEP_NAMES.map((name) => ({ name, status: "waiting", worker: "" })),
  )

  protected readonly plainCaption = computed(() => {
    const o = this.order()
    if (!o) return "Runs in one worker's memory."
    const who = this.labelOf(o.plain.worker) || "its worker"
    if (o.plain.stuck) {
      return o.payments.plainCharged
        ? `Died with ${who}. Charged, never shipped.`
        : `Died with ${who}. Never finished.`
    }
    if (o.plain.steps.at(-1) === "done") return `Finished, because ${who} stayed up.`
    return `Running in ${who}'s memory.`
  })

  protected readonly temporalCaption = computed(() => {
    const o = this.order()
    if (!o) return "Each step is recorded, so any worker can carry on."
    const move = this.moves()[0]
    const moved = move
      ? `${this.labelOf(move.from)} died during ${move.step}. Temporal moved it to ${this.labelOf(move.to)}. `
      : ""
    const charged = o.payments.charges
      ? `Charged once${o.payments.attempts > 1 ? `, ${o.payments.attempts} attempts` : ""}.`
      : ""
    return `${moved}${charged}`.trim() || "Waiting for a worker."
  })

  protected readonly result = computed(() => {
    const o = this.order()
    if (!o?.workflow.done) return ""
    if (o.workflow.handoffs > 0) {
      return o.plain.stuck && o.payments.plainCharged
        ? "Same crash, two outcomes. With Temporal the customer got their order. Without it they paid for nothing."
        : "Same crash, two outcomes. Temporal finished the order. The other copy stopped."
    }
    return "Both finished, because no worker died. Try again and unplug partway."
  })

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling())
  }

  protected labelOf(pod: string): string {
    return this.workers().find((w) => w.pod === pod)?.label ?? ""
  }

  protected mark(status: string): string {
    return MARK[status] ?? ""
  }

  protected moveOf(step: string): Move | undefined {
    return this.moves().find((m) => m.step === step)
  }

  // Under each chip: who ran it, and "B→A" when it moved.
  protected whoText(s: Step): string {
    const short = (pod: string) => this.labelOf(pod).replace("Worker ", "")
    const move = this.moveOf(s.name)
    if (move) return `${short(move.from)}→${short(move.to)}`
    return s.worker ? short(s.worker) : ""
  }

  // History lines name pods. Show the same worker letters as the cards.
  protected eventText(text: string): string {
    return this.workers().reduce((t, w) => t.replaceAll(w.pod, w.label), text)
  }

  protected async placeOrder(): Promise<void> {
    this.error.set(null)
    this.busy.set(true)
    try {
      const res = await fetch(`https://${this.host()}/orders`, { method: "POST" })
      if (!res.ok) throw new Error(await res.text())
      const { id } = (await res.json()) as { id: string }
      this.orderId = id
      this.order.set(null)
      this.moves.set([])
      this.unplugged.set(false)
      this.everPlaced.set(true)
      this.startPolling()
    } catch (e) {
      this.error.set(`Could not place the order. ${e instanceof Error ? e.message : ""}`.trim())
    } finally {
      this.busy.set(false)
    }
  }

  protected async unplug(): Promise<void> {
    if (!this.orderId) return
    this.error.set(null)
    const res = await fetch(`https://${this.host()}/orders/${this.orderId}/unplug`, {
      method: "POST",
    }).catch(() => null)
    if (res?.ok) {
      this.unpluggedLabel.set(this.labelOf(this.busyPod()))
      this.unplugged.set(true)
    } else {
      this.error.set("Could not unplug. The step may have just finished.")
    }
  }

  // A step whose worker changed between polls was moved by the workflow.
  private recordMoves(prev: OrderView | null, next: OrderView): void {
    if (!prev) return
    for (const step of next.workflow.steps) {
      const before = prev.workflow.steps.find((s) => s.name === step.name)
      if (
        before?.worker &&
        step.worker &&
        before.worker !== step.worker &&
        !this.moveOf(step.name)
      ) {
        this.moves.update((m) => [...m, { step: step.name, from: before.worker, to: step.worker }])
      }
    }
  }

  private startPolling(): void {
    this.stopPolling()
    this.pollStarted = Date.now()
    const tick = async () => {
      const res = await fetch(`https://${this.host()}/orders/${this.orderId}`, {
        cache: "no-store",
      }).catch(() => null)
      if (res?.ok) {
        const o = (await res.json()) as OrderView
        this.recordMoves(this.order(), o)
        this.order.set(o)
        const plainSettled = o.plain.stuck || o.plain.steps.at(-1) === "done"
        if (o.workflow.done && plainSettled) this.stopPolling()
      }
      if (Date.now() - this.pollStarted > MAX_POLL_MS) this.stopPolling()
    }
    void tick()
    this.pollTimer = setInterval(tick, 1000)
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }
}
