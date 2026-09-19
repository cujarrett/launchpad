import { ChangeDetectionStrategy, Component } from "@angular/core"
import { RouterLink } from "@angular/router"
import { Topology } from "./topology"

// The map is the page. Everything here exists to hand it the tallest box the
// viewport allows, so the whole walkthrough is visible without scrolling.
@Component({
  selector: "app-how-it-works",
  imports: [RouterLink, Topology],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="hiw-head">
        <a class="breadcrumb" routerLink="/">Workspaces</a>
        <span class="breadcrumb-sep">›</span>
        <h1>How my bookshelf developer platform works</h1>
      </div>

      <app-topology />
    </div>
  `,
  styles: [
    `
      /* height: 0 with flex-grow is what pins the page to the viewport. Left on
         auto, this flex item reports its content height to app-root, app-root
         grows past 100dvh, and the item grows with it - so the map gets taller
         than the screen instead of fitting in it. */
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 0;
        height: 0;
        min-height: 0;
      }

      .page {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        gap: 0.75rem;
        max-width: 1600px;
        width: 100%;
        padding: 1.25rem 1.5rem 1rem;
      }

      .hiw-head {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 0.5rem 0.75rem;
      }
      .hiw-head h1 {
        font-size: 1.35rem;
      }
      .hiw-head p {
        flex: 1 1 24rem;
        min-width: 0;
        font-size: 0.85rem;
        color: var(--color-text-muted);
      }

      app-topology {
        display: flex;
        flex: 1;
        min-height: 0;
      }

      /* Below this the rail sits under the map and the page is taller than the
         viewport, so hand scrolling back to the page. */
      @media (max-width: 1100px), (max-height: 620px) {
        :host {
          flex: none;
          height: auto;
        }
        .page {
          min-height: auto;
        }
        app-topology {
          flex: none;
        }
      }
    `,
  ],
})
export class HowItWorks {}
