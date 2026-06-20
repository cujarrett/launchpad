import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { RouterLink, RouterOutlet } from "@angular/router"
import { MsalService } from "@azure/msal-angular"
import { RoleService } from "./core/services/role.service"
import { environment } from "../environments/environment"

@Component({
  selector: "app-root",
  imports: [RouterOutlet, RouterLink],
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
      <header class="app-nav">
        <a class="app-nav-logo" routerLink="/">
          <span>🚀 Launchpad</span>
        </a>
        <div class="app-nav-user">
          @if (roleService.isAuthenticated()) {
            @if (roleService.userName()) {
              <span class="app-nav-name">{{ roleService.userName() }}</span>
            }
            <button class="secondary" (click)="signOut()">Sign out</button>
          } @else {
            <button class="secondary" (click)="signIn()">Sign in</button>
          }
        </div>
      </header>
      <router-outlet />
      <footer class="app-footer">
        <a href="https://blog.mattjarrett.dev/platform/" target="_blank" rel="noopener noreferrer"
          >Made by Matt Jarrett</a
        >
        with ♥ and Kubernetes
      </footer>
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
  private readonly msal = inject(MsalService)
  protected readonly roleService = inject(RoleService)
  protected readonly maintenance = environment.maintenanceMode

  signOut() {
    this.msal.logoutRedirect({ postLogoutRedirectUri: "/signed-out" })
  }

  signIn() {
    this.msal.loginRedirect()
  }
}
