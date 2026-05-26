import { Injectable, inject } from '@angular/core'
import { Observable, from, switchMap, timer } from 'rxjs'
import { retry } from 'rxjs/operators'
import { MsalService } from '@azure/msal-angular'
import { ResourceStatus } from '../models/workspace.model'
import { environment } from '../../../environments/environment'

@Injectable({ providedIn: 'root' })
export class SseService {
  private readonly msal = inject(MsalService)

  watchStatus(url: string): Observable<ResourceStatus> {
    return from(this.acquireToken()).pipe(
      // NOTE: EventSource does not support Authorization headers. The token is
      // passed as a query param as a workaround. The backend should treat it as
      // short-lived and validate strictly. Prefer cookie-based auth or a
      // fetch-based SSE proxy to avoid token exposure in server logs.
      switchMap((token) => this.openEventSource(token ? `${url}?token=${token}` : url)),
      retry({ delay: () => timer(5000) }),
    )
  }

  private async acquireToken(): Promise<string | null> {
    const account =
      this.msal.instance.getActiveAccount() ?? this.msal.instance.getAllAccounts()[0]
    if (!account) return null
    return this.msal.instance
      .acquireTokenSilent({ scopes: [environment.msalApiScope], account })
      .then((r) => r.accessToken)
      .catch(() => null)
  }

  private openEventSource(url: string): Observable<ResourceStatus> {
    return new Observable<ResourceStatus>((observer) => {
      const source = new EventSource(url)

      source.onmessage = (event) => {
        try {
          observer.next(JSON.parse(event.data) as ResourceStatus)
        } catch {
          // malformed event — skip
        }
      }

      source.onerror = (err) => {
        console.error('[SseService] EventSource error, will retry', err)
        source.close()
        observer.error(err)
      }

      return () => source.close()
    })
  }
}
