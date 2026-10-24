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
            <circle class="pin" [attr.cx]="p.x" [attr.cy]="p.y" r="6" />
          }
        </svg>
      </figure>
    }
  `,
  styles: [
    `
      .sandbox-map {
        max-width: 560px;
        margin: 2.5rem auto 0;
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
      }
      .land {
        fill: var(--color-surface-alt);
      }
      .borders {
        fill: none;
        stroke: var(--color-border);
        stroke-width: 1;
      }
      .pin {
        fill: var(--color-accent);
        fill-opacity: 0.8;
        stroke: var(--color-bg);
        stroke-width: 1.5;
      }
      figcaption {
        margin-top: 0.5rem;
        text-align: center;
        font-size: 0.8rem;
        color: var(--color-text-muted);
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
