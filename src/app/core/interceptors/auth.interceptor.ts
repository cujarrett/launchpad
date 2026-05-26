import { HttpEvent, HttpHandlerFn, HttpRequest } from '@angular/common/http'
import { inject } from '@angular/core'
import { MsalService } from '@azure/msal-angular'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { EMPTY, Observable, from } from 'rxjs'
import { catchError, switchMap } from 'rxjs/operators'
import { environment } from '../../../environments/environment'

/**
 * Attaches a Bearer token to /api/* requests when the user is logged in.
 * If silent acquisition fails with InteractionRequiredAuthError (e.g. consent
 * needed for the API scope), triggers a redirect to Entra for interactive login.
 * For write requests (POST/DELETE), any silent failure also triggers re-login
 * rather than passing through unauthenticated (which would always return 401).
 */
export function authInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  if (!req.url.startsWith('/api/')) return next(req)

  const msal = inject(MsalService)
  // getActiveAccount() can be null after a page refresh if setActiveAccount
  // wasn't called yet — fall back to any cached account as a safety net.
  const account = msal.instance.getActiveAccount() ?? msal.instance.getAllAccounts()[0] ?? null

  if (!account) {
    console.warn('[authInterceptor] no active account, sending unauthenticated')
    return next(req)
  }

  const isWrite = req.method === 'POST' || req.method === 'DELETE' || req.method === 'PUT'

  return from(
    msal.instance.acquireTokenSilent({
      scopes: [environment.msalApiScope],
      account,
    }),
  ).pipe(
    switchMap((result) =>
      next(req.clone({ setHeaders: { Authorization: `Bearer ${result.accessToken}` } })),
    ),
    catchError((error) => {
      if (error instanceof InteractionRequiredAuthError || isWrite) {
        // For write requests, any silent failure → redirect to re-login.
        // Passing through unauthenticated would always produce "missing token".
        msal.instance.acquireTokenRedirect({
          scopes: [environment.msalApiScope],
          account,
        })
        return EMPTY
      }
      console.error('[authInterceptor] acquireTokenSilent failed, sending unauthenticated:', error)
      return next(req) // read-only — pass through unauthenticated (API allows it)
    }),
  )
}
