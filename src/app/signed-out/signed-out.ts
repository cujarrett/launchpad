import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { MsalService } from "@azure/msal-angular"

@Component({
  selector: "app-signed-out",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" style="text-align: center; padding-top: 6rem;">
      <p class="muted">You've been signed out.</p>
      <button (click)="signIn()" style="margin-top: 1rem;">Sign in</button>
    </div>
  `,
})
export class SignedOut {
  private readonly msal = inject(MsalService)

  signIn() {
    this.msal.loginRedirect()
  }
}
