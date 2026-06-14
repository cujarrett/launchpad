import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { RouterLink, RouterOutlet } from "@angular/router"
import { MsalService } from "@azure/msal-angular"
import { RoleService } from "./core/services/role.service"

@Component({
  selector: "app-root",
  imports: [RouterOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
  `,
})
export class App {
  private readonly msal = inject(MsalService)
  protected readonly roleService = inject(RoleService)

  signOut() {
    this.msal.logoutRedirect({ postLogoutRedirectUri: "/signed-out" })
  }

  signIn() {
    this.msal.loginRedirect()
  }
}
