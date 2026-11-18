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
