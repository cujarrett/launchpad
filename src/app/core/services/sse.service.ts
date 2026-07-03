import { Injectable, inject } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { Observable, of, switchMap, timer } from "rxjs"
import { catchError, retry } from "rxjs/operators"
import { MsalService } from "@azure/msal-angular"
import { ResourceStatus } from "../models/workspace.model"

@Injectable({ providedIn: "root" })
export class SseService {
  private readonly msal = inject(MsalService)
  private readonly http = inject(HttpClient)

  watchStatus(url: string): Observable<ResourceStatus> {
    return this.acquireTicket(url).pipe(
      switchMap((ticket) =>
        this.openEventSource(ticket ? `${url}?ticket=${encodeURIComponent(ticket)}` : url),
      ),
      retry({ delay: () => timer(5000) }),
    )
  }

  // EventSource can't send an Authorization header, so we can't hand it the
  // real MSAL access token directly without putting it in the URL (and from
  // there, every access log and proxy it transits). Instead, exchange the
  // real token for a short-lived, single-use ticket over a normal
  // header-authenticated request (authInterceptor attaches the Bearer token),
  // and pass that ticket in the URL instead — worthless if logged or leaked.
  private acquireTicket(url: string): Observable<string | null> {
    const account = this.msal.instance.getActiveAccount() ?? this.msal.instance.getAllAccounts()[0]
    if (!account) return of(null)

    return this.http.post<{ ticket: string }>(`${url}/ticket`, {}).pipe(
      switchMap((res) => of(res.ticket)),
      catchError(() => of(null)),
    )
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
        console.error("[SseService] EventSource error, will retry", err)
        source.close()
        observer.error(err)
      }

      return () => source.close()
    })
  }
}
