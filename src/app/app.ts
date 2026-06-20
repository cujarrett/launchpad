import { ChangeDetectionStrategy, Component } from "@angular/core"
import { RouterOutlet } from "@angular/router"
import { environment } from "../environments/environment"

@Component({
  selector: "app-root",
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (maintenance) {
      <div class="maintenance">
        <div class="maintenance-content">
          <span class="maintenance-icon">🚀</span>
          <h1>Building more awesome</h1>
          <p>Be back soon!</p>
        </div>
      </div>
    } @else {
      <router-outlet />
    }
  `,
  styles: [
    `
      .maintenance {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-bg);
        text-align: center;
      }
      .maintenance-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
      }
      .maintenance-icon {
        font-size: 4rem;
        animation: bounce 1.5s infinite;
      }
      h1 {
        font-size: 2rem;
        margin: 0;
      }
      p {
        font-size: 1.25rem;
        margin: 0;
        opacity: 0.7;
      }
      @keyframes bounce {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-12px);
        }
      }
    `,
  ],
})
export class App {
  protected readonly maintenance = environment.maintenanceMode
}
