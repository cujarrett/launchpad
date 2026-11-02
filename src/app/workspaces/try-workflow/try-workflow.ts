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

// What a server is doing during each step, in words a guest reads at a glance.
const DOING: Record<string, string> = {
  charge: "charging the card",
  pack: "packing the box",
  ship: "shipping the box",
  email: "emailing the receipt",
}

const MARK: Record<string, string> = { done: "✓", running: "●", stuck: "✗", waiting: "·" }

@Component({
  selector: "app-try-workflow",
  template: `
    <section class="panel">
      <div class="head">
        <h3>Crash a server mid-order</h3>
        <details class="why" [open]="!everPlaced() && wide">
          <summary>Why this matters</summary>
          <ul>
            <li>Servers crash and redeploy all the time.</li>
            <li>Without Temporal, a crash can charge a card and never ship.</li>
            <li>Temporal saves each step, so another server carries on.</li>
          </ul>
        </details>
      </div>
      <p class="bridge">Each order runs twice: without Temporal and with it.</p>

      <div class="spotlight" [class.urgent]="stage() === 2" [class.win]="won()">
        <ol class="steps">
          <li
            [class.active]="stage() === 1 && !finished()"
            [class.done]="stage() > 1 || finished()"
          >
            1 · Order
          </li>
          <li [class.active]="stage() === 2" [class.done]="stage() > 2 || won()">2 · Crash</li>
          <li [class.active]="stage() === 3" [class.done]="won()">3 · Watch</li>
        </ol>
        <p class="prompt">{{ prompt() }}</p>
        <div class="action">
          @if (stage() === 1) {
            <button
              class="go"
              [class.pulse]="!order() || missed()"
              (click)="placeOrder()"
              [disabled]="busy()"
            >
              {{ order() ? "Run it again" : "Place an order" }}
            </button>
          } @else if (stage() === 2) {
            <button class="danger pulse" (click)="unplug()" [disabled]="!canUnplug()">
              ⚡ Unplug {{ labelOf(busyPod()) || "the server" }}
            </button>
          } @else {
            <span class="watching"><span class="spinner"></span>Watching the order recover</span>
          }
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
      </div>
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
      .spotlight {
        margin: 0.25rem 0 0.5rem;
        padding: 1rem;
        border-radius: 10px;
        border: 1px solid rgba(124, 58, 237, 0.5);
        background: rgba(124, 58, 237, 0.08);
        transition:
          border-color 0.3s,
          background 0.3s;
      }
      .spotlight.urgent {
        border-color: #ef4444;
        background: rgba(239, 68, 68, 0.08);
      }
      .spotlight.win {
        border-color: #4ade80;
        background: rgba(74, 222, 128, 0.08);
      }
      .steps {
        display: flex;
        gap: 1rem;
        list-style: none;
        margin: 0 0 0.5rem;
        padding: 0;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .steps li {
        opacity: 0.4;
      }
      .steps li.active {
        opacity: 1;
        color: #c4b5fd;
        font-weight: 700;
      }
      .steps li.done {
        opacity: 0.8;
        color: #4ade80;
      }
      .prompt {
        margin: 0 0 0.75rem;
        font-size: 1.05rem;
        font-weight: 600;
      }
      .spotlight.win .prompt {
        color: #bbf7d0;
      }
      .action {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .action button {
        border: 1px solid transparent;
        color: #fff;
        font-weight: 700;
        font-size: 1rem;
        padding: 0.6rem 1.2rem;
      }
      button.go {
        background: #6366f1;
        --glow: rgba(99, 102, 241, 0.6);
      }
      button.danger {
        background: #dc2626;
        --glow: rgba(239, 68, 68, 0.6);
      }
      .action button:disabled {
        background: transparent;
        border-color: rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.35);
        cursor: not-allowed;
        animation: none;
      }
      .pulse {
        animation: pulse 1.4s ease-in-out infinite;
      }
      @keyframes pulse {
        0%,
        100% {
          box-shadow: 0 0 0 0 var(--glow);
        }
        50% {
          box-shadow: 0 0 0 8px transparent;
        }
      }
      .watching {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
        color: #c4b5fd;
      }
      .spinner {
        width: 0.9rem;
        height: 0.9rem;
        border-radius: 50%;
        border: 2px solid rgba(196, 181, 253, 0.3);
        border-top-color: #c4b5fd;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .pulse,
        .spinner {
          animation: none;
        }
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
      @media (max-width: 600px) {
        .panel {
          padding: 0.85rem 1rem;
        }
        .bridge {
          margin-bottom: 0.75rem;
        }
        .prompt {
          font-size: 0.95rem;
        }
        .track {
          margin-top: 0.6rem;
          padding: 0.6rem;
        }
        .chips {
          flex-wrap: nowrap;
          gap: 0.3rem;
        }
        .chip {
          padding: 0.2rem 0.45rem;
          font-size: 0.75rem;
          white-space: nowrap;
        }
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
  // Phones start with the explainer folded, so the button is on the first screen.
  protected readonly wide = window.matchMedia("(min-width: 601px)").matches
  protected readonly order = signal<OrderView | null>(null)
  protected readonly error = signal<string | null>(null)
  protected readonly busy = signal(false)
  // Read by the page, which hides its start button once the demo has begun.
  readonly everPlaced = signal(false)
  protected readonly unpluggedLabel = signal("")
  private readonly unpluggedStep = signal("")
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
        label: `Server ${String.fromCharCode(65 + i)}`,
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

  protected readonly finished = computed(() => !!this.order()?.workflow.done)
  protected readonly won = computed(
    () => this.finished() && (this.order()?.workflow.handoffs ?? 0) > 0,
  )
  protected readonly missed = computed(() => this.finished() && !this.won())

  // The one thing to do or watch next.
  protected readonly prompt = computed(() => {
    const o = this.order()
    if (!o)
      return "Place an order. Then crash the server working on it, and see which copy survives."
    if (this.won()) return this.result()
    if (this.missed())
      return "No server crashed, so both finished. Run it again and hit Unplug mid-order."
    if (this.stage() === 3) {
      const move = this.moves()[0]
      return move
        ? `Temporal moved the order to ${this.labelOf(move.to)}. Finishing it now…`
        : `${this.unpluggedLabel() || "The server"} is down. Watch the order carry on without it…`
    }
    const running = o.workflow.steps.find((s) => s.status === "running")
    if (!running) return "Starting the order…"
    if (!this.canUnplug())
      return `${this.restarting()?.label ?? "The other server"} is restarting. Wait a moment.`
    return `${this.labelOf(running.worker)} is ${DOING[running.name] ?? running.name}. Unplug it now!`
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
    if (!o) return "Lives on one server. If that server dies, so does the order."
    const who = this.labelOf(o.plain.worker) || "its server"
    if (o.plain.stuck) {
      return o.payments.plainCharged
        ? `Died with ${who}. Charged, never shipped.`
        : `Died with ${who}. Never finished.`
    }
    if (o.plain.steps.at(-1) === "done") return `Finished, because ${who} stayed up.`
    return `${who} is running it alone.`
  })

  protected readonly temporalCaption = computed(() => {
    const o = this.order()
    if (!o) return "Each step is saved, so any server can pick it up."
    const move = this.moves()[0]
    const doing = (step: string) => DOING[step] ?? step
    // The crashed server can restart and take the order back before the other one does.
    const recovered = move
      ? `${this.labelOf(move.from)} died while ${doing(move.step)}. Temporal moved the order to ${this.labelOf(move.to)}. `
      : o.workflow.handoffs > 0 && this.unpluggedLabel()
        ? `${this.unpluggedLabel()} died while ${doing(this.unpluggedStep())}. Temporal carried on once it was back. `
        : ""
    const charged = o.payments.charges
      ? o.payments.attempts > 1
        ? `Charged once, though the charge step ran ${o.payments.attempts} times.`
        : "Charged once."
      : ""
    return `${recovered}${charged}`.trim() || "Waiting for a server."
  })

  protected readonly result = computed(() => {
    const o = this.order()
    if (!o?.workflow.done) return ""
    return o.plain.stuck && o.payments.plainCharged
      ? "Same crash, two outcomes. With Temporal the customer got their order. Without it they paid for nothing."
      : "Same crash, two outcomes. Temporal finished the order. The other copy stopped."
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

  // Under each chip: which server ran it, or where it moved.
  protected whoText(s: Step): string {
    const move = this.moveOf(s.name)
    if (move) return `moved to ${this.labelOf(move.to).replace("Server ", "")}`
    return s.worker ? this.labelOf(s.worker) : ""
  }

  // History lines name pods. Show the same worker letters as the cards.
  protected eventText(text: string): string {
    return this.workers().reduce((t, w) => t.replaceAll(w.pod, w.label), text)
  }

  async placeOrder(): Promise<void> {
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
      this.unpluggedStep.set(
        this.order()?.workflow.steps.find((s) => s.status === "running")?.name ?? "",
      )
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
