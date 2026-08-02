import { ChangeDetectionStrategy, Component, input } from "@angular/core"

// The brand mark — brackets holding an ascending arrow. Sized by the parent
// through --mark-size so callers never touch the geometry.
@Component({
  selector: "app-launchpad-mark",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 80 64" role="img" aria-label="Launchpad" [class.animate]="animate()">
      <g class="bracket">
        <path d="M27 10 H14 V54 H27" />
        <path d="M53 10 H66 V54 H53" />
      </g>
      <g class="arrow">
        <path d="M40 50 V22" />
        <path d="M31.5 30.5 L40 20 L48.5 30.5" />
      </g>
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        line-height: 0;
      }
      svg {
        width: var(--mark-size, 2.25rem);
        height: auto;
      }
      .bracket path {
        fill: none;
        stroke: var(--mark-bracket, var(--color-accent));
        stroke-width: 6;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .arrow path {
        fill: none;
        stroke: var(--mark-arrow, #c7d2fe);
        stroke-width: 8.5;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      /* Brackets draw themselves, then the payload lifts into the gap. */
      .animate .bracket path {
        stroke-dasharray: 120;
        animation: mark-draw 0.55s cubic-bezier(0.4, 0, 0.2, 1) both;
      }
      .animate .bracket path:last-child {
        animation-delay: 0.08s;
      }
      .animate .arrow {
        animation: mark-rise 0.5s cubic-bezier(0.34, 1.3, 0.64, 1) 0.4s both;
      }
      @keyframes mark-draw {
        from {
          stroke-dashoffset: 120;
        }
        to {
          stroke-dashoffset: 0;
        }
      }
      @keyframes mark-rise {
        from {
          transform: translateY(14px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .animate .bracket path,
        .animate .arrow {
          animation: none;
          stroke-dashoffset: 0;
          opacity: 1;
          transform: none;
        }
      }
    `,
  ],
})
export class LaunchpadMark {
  readonly animate = input(false)
}
