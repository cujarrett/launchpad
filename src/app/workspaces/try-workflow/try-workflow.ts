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

// Polling stops once both copies have settled, or after this long.
const MAX_POLL_MS = 2 * 60 * 1000

@Component({
  selector: "app-try-workflow",
  template: `
    <section class="panel">
      <h3>Try your workflow</h3>
      <p class="narrator">{{ narrator() }}</p>

      <div class="workers">
        @for (w of workers(); track w.pod) {
          <div class="worker" [class.online]="w.online" [class.busy]="w.pod === busyPod()">
            <span class="dot"></span>
            <span class="name">{{ w.label }}</span>
            <span class="state">{{
              w.online ? (w.pod === busyPod() ? "working" : "online") : "offline"
            }}</span>
          </div>
        }
      </div>

      <div class="actions">
        <button (click)="placeOrder()" [disabled]="busy()">Place order</button>
        <button class="secondary" (click)="unplug()" [disabled]="!canUnplug() || busy()">
          Unplug {{ busyPod() ? labelOf(busyPod()) : "the busy worker" }}
        </button>
      </div>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      @if (order(); as o) {
        <div class="copies">
          <div class="copy">
            <h4>Without Temporal</h4>
            <p class="sub">A plain loop in {{ labelOf(o.plain.worker) || "a worker" }}'s memory</p>
            <ol>
              @for (s of o.plain.steps; track $index) {
                <li [class]="s">
                  {{ stepNames[$index] }} <span>{{ s }}</span>
                </li>
              }
            </ol>
            @if (o.plain.stuck) {
              <p class="verdict bad">Stuck. Its worker died, and the order died with it.</p>
            }
            <p class="money">Charged: {{ o.payments.plainCharged ? "yes" : "no" }}</p>
          </div>
          <div class="copy">
            <h4>With Temporal</h4>
            <p class="sub">The same order as a workflow</p>
            <ol>
              @for (s of o.workflow.steps; track s.name) {
                <li [class]="s.status">
                  {{ s.name }}
                  <span>{{ s.status }}{{ s.worker ? " on " + labelOf(s.worker) : "" }}</span>
                </li>
              }
            </ol>
            @if (o.workflow.done) {
              <p class="verdict good">
                Finished{{ o.workflow.handoffs ? " after moving to another worker" : "" }}.
              </p>
            }
            <p class="money">
              Charge attempts: {{ o.payments.attempts }}, charges: {{ o.payments.charges }}
            </p>
          </div>
        </div>

        <details>
          <summary>How it works</summary>
          <ul class="how">
            <li>Each order sticks to one worker through that worker's own task queue.</li>
            <li>
              When the worker stops answering, the workflow moves the step to the other worker.
            </li>
            <li>The charge reruns there. The payment provider refuses the repeat by order ID.</li>
            <li>
              The plain copy lives only in one worker's memory, so it stops when that worker does.
            </li>
          </ul>
          @if (o.events?.length) {
            <h4>Event history from Temporal</h4>
            <ol class="events">
              @for (e of o.events; track $index) {
                <li>
                  <time>{{ e.time.slice(11, 19) }}</time> {{ eventText(e.text) }}
                </li>
              }
            </ol>
          }
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
      h3 {
        margin: 0 0 0.25rem;
        font-size: 1rem;
      }
      h4 {
        margin: 0;
        font-size: 0.85rem;
      }
      .narrator {
        margin: 0 0 0.75rem;
        color: #c4b5fd;
        font-size: 0.9rem;
      }
      .workers {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-bottom: 0.75rem;
      }
      .worker {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.4rem 0.75rem;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        font-size: 0.8rem;
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
      .actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .error {
        color: #fca5a5;
        font-size: 0.8rem;
      }
      .copies {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-top: 1rem;
      }
      @media (max-width: 600px) {
        .copies {
          grid-template-columns: 1fr;
        }
      }
      .copy {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 0.75rem;
      }
      .sub {
        margin: 0.1rem 0 0.5rem;
        font-size: 0.75rem;
        opacity: 0.6;
      }
      ol {
        margin: 0;
        padding-left: 1.2rem;
        font-size: 0.8rem;
      }
      li span {
        opacity: 0.6;
      }
      li.done span {
        color: #4ade80;
        opacity: 1;
      }
      li.running span {
        color: #c4b5fd;
        opacity: 1;
      }
      li.interrupted span {
        color: #fca5a5;
        opacity: 1;
      }
      .verdict {
        margin: 0.5rem 0 0;
        font-size: 0.8rem;
      }
      .verdict.good {
        color: #4ade80;
      }
      .verdict.bad {
        color: #fca5a5;
      }
      .money {
        margin: 0.5rem 0 0;
        font-size: 0.8rem;
        font-variant-numeric: tabular-nums;
      }
      details {
        margin-top: 1rem;
        font-size: 0.8rem;
      }
      summary {
        cursor: pointer;
      }
      .how {
        padding-left: 1.2rem;
      }
      .events time {
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

  protected readonly stepNames = ["charge", "pack", "ship", "email"]
  protected readonly order = signal<OrderView | null>(null)
  protected readonly error = signal<string | null>(null)
  protected readonly busy = signal(false)

  private orderId = ""
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private pollStarted = 0

  protected readonly workers = computed(() =>
    Object.values(this.podStatusMap())
      .filter((p): p is ResourceStatus => !!p && p.name.startsWith(this.apiName() + "-"))
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

  // A worker restarts slower after each unplug. Unplugging the only live one stalls the demo.
  private readonly restarting = computed(() => this.workers().find((w) => !w.online))
  protected readonly canUnplug = computed(() => !!this.busyPod() && !this.restarting())

  protected readonly narrator = computed(() => {
    const o = this.order()
    const down = this.restarting()
    const running = o?.workflow.steps.find((s) => s.status === "running")
    if (!o) return "Place an order. Each of its four steps takes about four seconds."
    const wf = o.workflow
    if (wf.done && wf.handoffs > 0) {
      return `Done. Temporal finished the order on another worker and charged once. The plain copy never finished.`
    }
    if (wf.done) return "Done. Place another order, and unplug its worker partway through."
    if (wf.handoffs > 0 && running) {
      return `The first worker went offline. Temporal moved ${running.name} to ${this.labelOf(running.worker)}.`
    }
    // Checked after the handoff line, so the guest still sees the order move.
    if (down && running) return `${down.label} is restarting. Wait for it to come back.`
    if (running) return `${this.labelOf(running.worker)} is on ${running.name}. Unplug it now.`
    return "Finding a worker…"
  })

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling())
  }

  protected labelOf(pod: string): string {
    return this.workers().find((w) => w.pod === pod)?.label ?? ""
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
    if (!res?.ok) this.error.set("Could not unplug. The step may have just finished.")
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
