import { computed, inject, Injectable, OnDestroy, signal } from "@angular/core"
import { MsalBroadcastService, MsalService } from "@azure/msal-angular"
import { AccountInfo, AuthenticationResult, EventType } from "@azure/msal-browser"
import { Subscription } from "rxjs"
import { filter } from "rxjs/operators"

@Injectable({ providedIn: "root" })
export class RoleService implements OnDestroy {
  private readonly msal = inject(MsalService)
  private readonly broadcast = inject(MsalBroadcastService)
  private readonly sub: Subscription

  // Reactive account — updated by MSAL broadcast events.
  private readonly account = signal<AccountInfo | null>(this.msal.instance.getActiveAccount())

  readonly isAuthenticated = computed(() => !!this.account())

  // Read roles directly from idTokenClaims (typed on TokenClaims).
  readonly isContributor = computed(
    () => this.account()?.idTokenClaims?.roles?.includes("Contributor") ?? false,
  )

  readonly userName = computed(() => this.account()?.name ?? null)

  constructor() {
    this.sub = this.broadcast.msalSubject$
      .pipe(
        filter(
          (e) =>
            e.eventType === EventType.LOGIN_SUCCESS ||
            e.eventType === EventType.ACQUIRE_TOKEN_SUCCESS ||
            e.eventType === EventType.LOGOUT_SUCCESS,
        ),
      )
      .subscribe((e) => {
        if (e.eventType === EventType.LOGOUT_SUCCESS) {
          this.account.set(null)
        } else {
          // Use the payload's account — it carries fresh idTokenClaims from the
          // token response. getActiveAccount() returns the cache entity which may
          // not have idTokenClaims populated on older cached accounts.
          const payload = e.payload as AuthenticationResult | null
          this.account.set(payload?.account ?? this.msal.instance.getActiveAccount())
        }
      })
  }

  ngOnDestroy() {
    this.sub.unsubscribe()
  }
}
