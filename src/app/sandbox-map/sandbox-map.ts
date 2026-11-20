import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from "@angular/core"
import { firstValueFrom } from "rxjs"
import { WorkspaceService } from "../core/services/workspace.service"
import { BORDERS_PATH, LAND_PATH, MAP_HEIGHT, MAP_WIDTH, project } from "./us-map"

@Component({
  selector: "app-sandbox-map",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pins().length > 0) {
      <figure class="sandbox-map">
        <button type="button" class="map-btn" popovertarget="sandbox-map-about">
          <svg
            [attr.viewBox]="viewBox"
            role="img"
            aria-label="Map of places in the US that sandboxes were launched from"
          >
            <path class="land" [attr.d]="land" />
            <path class="borders" [attr.d]="borders" />
            @for (p of pins(); track $index) {
              <circle class="pin" [attr.cx]="p.x" [attr.cy]="p.y" r="13" />
            }
          </svg>
        </button>

        <div popover id="sandbox-map-about" class="about">
          <header>
            <h2>The law</h2>
            <button
              type="button"
              class="close"
              popovertarget="sandbox-map-about"
              popovertargetaction="hide"
              aria-label="Close"
            >
              ×
            </button>
          </header>
          <ul>
            <li>
              <b>Server logs.</b> This site logs requests to its own servers, as every website does.
            </li>
            <li>
              <b>Wiretap laws.</b> They cover third parties intercepting traffic. A site's own logs
              are outside them.
            </li>
            <li>
              <b>State privacy laws.</b> Laws like CCPA cover businesses above revenue or volume
              thresholds. A personal site is outside them.
            </li>
            <li>
              <b>GDPR.</b> It covers sites that target EU visitors. This map keeps US launches only.
            </li>
          </ul>
          <p class="fine">Not legal advice.</p>
        </div>
      </figure>
    }
  `,
  styles: [
    `
      /* The home page is a column, so the auto margin parks the map just above the footer. */
      :host {
        display: block;
        margin-top: auto;
      }
      /* 240px keeps the home page, map and footer on one 14 inch laptop screen. */
      .sandbox-map {
        max-width: 240px;
        margin: 0 auto 0.75rem;
      }
      .map-btn {
        display: block;
        width: 100%;
        border: 0;
        border-radius: var(--radius-md);
        background: none;
        color: var(--color-text-muted);
        font: inherit;
        cursor: pointer;
      }
      .map-btn:focus-visible,
      .close:focus-visible {
        outline: 2px solid var(--color-accent);
        outline-offset: 4px;
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
      }
      .land {
        fill: var(--color-surface-alt);
      }
      /* Non-scaling keeps state lines a hairline at any map size. */
      .borders {
        fill: none;
        stroke: var(--color-border);
        stroke-width: 0.75;
        vector-effect: non-scaling-stroke;
      }
      .pin {
        fill: #a78bfa;
        fill-opacity: 0.7;
        transition: fill-opacity 0.15s;
      }
      .map-btn:hover .pin {
        fill-opacity: 1;
      }

      /* The browser centres a popover with auto margins.
         The global reset zeroes every margin, so auto is set again here. */
      .about {
        width: min(26rem, calc(100vw - 2rem));
        max-height: 85dvh;
        margin: auto;
        padding: 1rem 1.5rem 1.25rem;
        overflow-y: auto;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background: var(--color-surface);
        color: var(--color-text);
      }
      .about::backdrop {
        background: rgb(0 0 0 / 0.6);
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      h2 {
        font-size: 1.05rem;
      }
      /* 44px is the smallest target a thumb hits reliably. */
      .close {
        width: 44px;
        height: 44px;
        margin-right: -0.75rem;
        border: 0;
        border-radius: var(--radius-sm);
        background: none;
        color: var(--color-text-muted);
        font-size: 1.5rem;
        line-height: 1;
        cursor: pointer;
      }
      .close:hover {
        color: var(--color-text);
      }
      li,
      .fine {
        color: var(--color-text-muted);
        font-size: 0.9rem;
        line-height: 1.5;
      }
      ul {
        list-style: none;
      }
      li {
        margin-top: 0.4rem;
      }
      b {
        color: var(--color-text);
        font-weight: 600;
      }
      .fine {
        margin-top: 1rem;
        font-size: 0.75rem;
      }
      /* Phone: a sheet at the bottom of the screen sits under the thumb. */
      @media (max-width: 600px) {
        .about {
          width: 100%;
          max-width: none;
          margin: auto 0 0;
          padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));
          border-bottom: 0;
          border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        }
      }
    `,
  ],
})
export class SandboxMap implements OnInit {
  private readonly workspaceService = inject(WorkspaceService)

  protected readonly viewBox = `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`
  protected readonly land = LAND_PATH
  protected readonly borders = BORDERS_PATH
  protected readonly pins = signal<{ x: number; y: number }[]>([])

  async ngOnInit() {
    try {
      const locations = await firstValueFrom(this.workspaceService.getGuestLocations())
      const points = locations.map((l) => project(l.lat, l.lon))
      this.pins.set(points.filter((p) => p !== null))
    } catch {
      // No map is better than an error on the landing page.
    }
  }
}
