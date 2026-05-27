import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from "@angular/core"
import { RouterLink, RouterOutlet } from "@angular/router"
import { MsalService } from "@azure/msal-angular"
import { RoleService } from "./core/services/role.service"

const TAGLINES = [
  "Ship solutions, not toil",
  "Bookshelf K8s Platform",
  "No sprints were harmed",
]

@Component({
  selector: "app-root",
  imports: [RouterOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="app-nav">
      <a class="app-nav-logo" routerLink="/">
        <span>🚀 Launchpad</span>
        <span class="app-nav-tagline" [style.opacity]="taglineVisible() ? 1 : 0">{{
          tagline()
        }}</span>
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
      Made by
      <a href="https://mattjarrett.dev" target="_blank" rel="noopener noreferrer">Matt Jarrett</a>
      with ♥ and Kubernetes
    </footer>
  `,
})
export class App implements OnDestroy {
  private readonly msal = inject(MsalService)
  protected readonly roleService = inject(RoleService)

  private readonly taglineIndex = signal(0)
  protected readonly taglineVisible = signal(true)
  protected readonly tagline = computed(() => TAGLINES[this.taglineIndex()])

  // Every 60s: fade out (400ms), swap text, fade back in.
  private fadeTimeout: ReturnType<typeof setTimeout> | undefined
  private readonly taglineTimer = setInterval(() => {
    this.taglineVisible.set(false)
    this.fadeTimeout = setTimeout(() => {
      this.taglineIndex.update((i) => (i + 1) % TAGLINES.length)
      this.taglineVisible.set(true)
    }, 400)
  }, 60_000)

  ngOnDestroy(): void {
    clearInterval(this.taglineTimer)
    clearTimeout(this.fadeTimeout)
  }

  signOut() {
    this.msal.logoutRedirect({ postLogoutRedirectUri: "/signed-out" })
  }

  signIn() {
    this.msal.loginRedirect()
  }
}
