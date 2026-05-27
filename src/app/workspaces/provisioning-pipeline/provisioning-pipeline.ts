import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core"
import { Resource, ResourceStatus } from "../../core/models/workspace.model"

type NodeState = "done" | "active" | "pending"
type Stage = "syncing" | "provisioning" | "integrating" | "idle"

interface PipelineNode {
  icon: string
  label: string
  sub: string
}

const NODES: PipelineNode[] = [
  { icon: "🚀", label: "You", sub: "Launched" },
  { icon: "📦", label: "GitHub", sub: "Committed" },
  { icon: "🔄", label: "GitOps", sub: "Syncing" },
  { icon: "⚙️", label: "Control Plane", sub: "Provisioning" },
  { icon: "🔌", label: "Services", sub: "Connecting" },
  { icon: "✨", label: "Live", sub: "Ready!" },
]

@Component({
  selector: "app-provisioning-pipeline",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stage() !== "idle") {
      <div class="pipeline-wrap">
        <p class="pipeline-title">{{ stageTitle() }}</p>
        <div class="pipeline-scroll">
          <div class="pipeline">
            @for (node of nodes; track node.label; let i = $index) {
              <div class="stage">
                <div
                  class="node"
                  [class.node--done]="nodeStates()[i] === 'done'"
                  [class.node--active]="nodeStates()[i] === 'active'"
                  [class.node--pending]="nodeStates()[i] === 'pending'"
                >
                  <div class="node-pulse"></div>
                  <span class="node-icon">{{ nodeStates()[i] === "done" ? "✓" : node.icon }}</span>
                </div>
                <span class="stage-label" [class.label--active]="nodeStates()[i] === 'active'">{{
                  node.label
                }}</span>
                <span class="stage-sub">{{ node.sub }}</span>
              </div>
              @if (i < nodes.length - 1) {
                <div
                  class="connector"
                  [class.connector--done]="connectorStates()[i] === 'done'"
                  [class.connector--active]="connectorStates()[i] === 'active'"
                  [class.connector--pending]="connectorStates()[i] === 'pending'"
                ></div>
              }
            }
          </div>
        </div>
        <p class="stage-message">{{ stageMessage() }}</p>
      </div>
    }
  `,
  styles: [
    `
      .pipeline-wrap {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 1.25rem 1.5rem 1rem;
        margin-bottom: 1.5rem;
      }

      .pipeline-title {
        margin: 0 0 1.25rem;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.4;
        font-weight: 600;
      }

      .pipeline-scroll {
        overflow-x: auto;
        padding-bottom: 0.25rem;
      }

      .pipeline {
        display: flex;
        align-items: flex-start;
        overflow: visible;
        padding: 18px 4px 4px;
      }

      /* ── Stage column ── */
      .stage {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        flex-shrink: 0;
        min-width: 64px;
      }

      /* ── Connector line ── */
      .connector {
        flex: 1;
        min-width: 20px;
        height: 2px;
        margin-top: 21px; /* (44px node - 2px line) / 2 → centers on the node */
        align-self: flex-start;
        position: relative;
        overflow: hidden;
      }

      .connector--done {
        background: #22c55e;
      }

      .connector--pending {
        background: rgba(255, 255, 255, 0.1);
      }

      .connector--active {
        background: rgba(124, 58, 237, 0.2);
      }

      .connector--active::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: -28px;
        right: 0;
        background: repeating-linear-gradient(
          90deg,
          #7c3aed 0,
          #7c3aed 10px,
          transparent 10px,
          transparent 24px
        );
        animation: flow-dots 0.55s linear infinite;
      }

      @keyframes flow-dots {
        from {
          transform: translateX(0);
        }
        to {
          transform: translateX(28px);
        }
      }

      /* ── Node circle ── */
      .node {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        position: relative;
        border: 2px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.05);
        transition:
          background 0.3s,
          border-color 0.3s;
      }

      .node--done {
        background: rgba(34, 197, 94, 0.15);
        border-color: #22c55e;
        color: #22c55e;
        font-size: 1rem;
        font-weight: 700;
      }

      .node--active {
        background: rgba(124, 58, 237, 0.2);
        border-color: #7c3aed;
        animation: pulse-node 1.8s ease-in-out infinite;
      }

      .node--pending {
        opacity: 0.3;
      }

      @keyframes pulse-node {
        0%,
        100% {
          box-shadow: 0 0 8px rgba(124, 58, 237, 0.3);
        }
        50% {
          box-shadow: 0 0 20px rgba(124, 58, 237, 0.65);
        }
      }

      /* Expanding ring on the active node */
      .node-pulse {
        display: none;
      }

      .node--active .node-pulse {
        display: block;
        position: absolute;
        inset: -7px;
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
          transform: scale(1.55);
          opacity: 0;
        }
      }

      /* ── Labels ── */
      .stage-label {
        font-size: 0.68rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.4;
        text-align: center;
        white-space: nowrap;
      }

      .label--active {
        opacity: 0.9;
        color: #a78bfa;
      }

      .stage-sub {
        font-size: 0.62rem;
        opacity: 0.25;
        text-align: center;
        white-space: nowrap;
        margin-top: -3px;
      }

      /* ── Bottom message ── */
      .stage-message {
        margin: 1rem 0 0;
        font-size: 0.78rem;
        opacity: 0.45;
        font-style: italic;
        line-height: 1.5;
      }
    `,
  ],
})
export class ProvisioningPipeline {
  readonly resources = input.required<Resource[]>()
  readonly statusMap = input.required<Partial<Record<string, ResourceStatus>>>()
  readonly allPreviewsReady = input.required<boolean>()

  protected readonly nodes = NODES

  protected readonly stage = computed<Stage>(() => {
    const resources = this.resources()
    const statusMap = this.statusMap()
    if (resources.length === 0) return "idle"
    if (resources.every((r) => statusMap[r.name]?.ready === true)) {
      return this.allPreviewsReady() ? "idle" : "integrating"
    }
    if (resources.some((r) => !statusMap[r.name])) return "syncing"
    return "provisioning"
  })

  // Which node index is active per stage (-1 = all done / idle)
  // You(0) GitHub(1) GitOps(2) ControlPlane(3) Services(4) Live(5)
  private readonly activeNodeIndex = computed(() => {
    switch (this.stage()) {
      case "syncing":
        return 2
      case "provisioning":
        return 3
      case "integrating":
        return 4
      default:
        return -1
    }
  })

  protected readonly nodeStates = computed<NodeState[]>(() => {
    const active = this.activeNodeIndex()
    return NODES.map(
      (_, i): NodeState => (i < active ? "done" : i === active ? "active" : "pending"),
    )
  })

  // Connectors sit between nodes, so connector[i] leads into node[i+1].
  // It's "active" when its destination node is active, "done" when past it.
  protected readonly connectorStates = computed<NodeState[]>(() => {
    const active = this.activeNodeIndex()
    return NODES.slice(0, -1).map(
      (_, i): NodeState => (i + 1 < active ? "done" : i + 1 === active ? "active" : "pending"),
    )
  })

  protected readonly stageTitle = computed(() => {
    switch (this.stage()) {
      case "syncing":
        return "Syncing to the cluster"
      case "integrating":
        return "Wiring up your preview"
      default:
        return "Assembling your resources"
    }
  })

  protected readonly stageMessage = computed(() => {
    switch (this.stage()) {
      case "syncing":
        return "ArgoCD is polling the Git repo for your changes and will apply them to the cluster."
      case "integrating":
        return "Resources are provisioned — waiting for the app to come online and the tunnel to route traffic."
      default:
        return "Crossplane is composing your infrastructure — databases, caches, and service bindings are being wired together automatically."
    }
  })
}
