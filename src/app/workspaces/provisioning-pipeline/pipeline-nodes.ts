import { ChangeDetectionStrategy, Component, input } from "@angular/core"

export type NodeState = "done" | "active" | "pending"

export const PIPELINE_NODES = [
  { icon: "📦", label: "Committed" },
  { icon: "🔄", label: "Syncing" },
  { icon: "⚙️", label: "Provisioning" },
  { icon: "🔌", label: "Connecting" },
  { icon: "✨", label: "Live" },
]

// The node strip above the status list. Split out from ProvisioningPipeline
// because together their styles blew the anyComponentStyle budget - nothing
// here reads the parent's state, it just renders the states it's handed.
@Component({
  selector: "app-pipeline-nodes",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pipeline-mini" [class.pipeline-mini--done]="done()">
      @for (node of nodes; track node.label; let i = $index) {
        <div class="pm-stage">
          <div
            class="pm-node"
            [class.pm-node--done]="states()[i] === 'done'"
            [class.pm-node--active]="states()[i] === 'active'"
            [class.pm-node--pending]="states()[i] === 'pending'"
          >
            <div class="pm-pulse"></div>
            <span class="pm-icon">{{ states()[i] === "done" ? "✓" : node.icon }}</span>
          </div>
          <span class="pm-label" [class.pm-label--active]="states()[i] === 'active'">{{
            node.label
          }}</span>
        </div>
        @if (i < nodes.length - 1) {
          <div
            class="pm-connector"
            [class.pm-connector--done]="states()[i] === 'done'"
            [class.pm-connector--active]="states()[i] === 'active'"
            [class.pm-connector--pending]="states()[i] === 'pending'"
          ></div>
        }
      }
    </div>
  `,
  styles: [
    `
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
export class PipelineNodes {
  readonly states = input.required<NodeState[]>()
  readonly done = input(false)
  protected readonly nodes = PIPELINE_NODES
}
