import {
  APP_INITIALIZER,
  ApplicationConfig,
  importProvidersFrom,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core'
import { provideRouter } from '@angular/router'
import { provideHttpClient, withInterceptors } from '@angular/common/http'
import { MSAL_BROADCAST_CONFIG, MsalModule, MsalService } from '@azure/msal-angular'
import { InteractionType, PublicClientApplication } from '@azure/msal-browser'
import { tap } from 'rxjs'

import { routes } from './app.routes'
import { environment } from '../environments/environment'
import { authInterceptor } from './core/interceptors/auth.interceptor'

if (!environment.msalTenantId || !environment.msalClientId || !environment.msalApiScope) {
  throw new Error(
    'MSAL config missing. Ensure NG_APP_MSAL_TENANT_ID, NG_APP_MSAL_CLIENT_ID, and NG_APP_MSAL_API_SCOPE are set.\n' +
    'Run: source ~/.secrets && npm start',
  )
}

const msalInstance = new PublicClientApplication({
  auth: {
    clientId: environment.msalClientId,
    authority: `https://login.microsoftonline.com/${environment.msalTenantId}`,
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: 'sessionStorage' },
})

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    importProvidersFrom(
      MsalModule.forRoot(
        msalInstance,
        {
          interactionType: InteractionType.Redirect,
          authRequest: { scopes: [environment.msalApiScope] },
        },
        {
          // protectedResourceMap is unused — authInterceptor handles token attachment.
          interactionType: InteractionType.Redirect,
          protectedResourceMap: new Map(),
        },
      ),
    ),
    { provide: MSAL_BROADCAST_CONFIG, useValue: { eventsToReplay: 1 } },
    {
      provide: APP_INITIALIZER,
      useFactory: (msal: MsalService) => () =>
        msal.handleRedirectObservable().pipe(
          tap((result) => {
            // result.account has fresh idTokenClaims from the redirect response.
            // Fall back to getAllAccounts() on plain page refresh.
            const account = result?.account ?? msal.instance.getAllAccounts()[0] ?? null
            if (account) msal.instance.setActiveAccount(account)
          }),
        ),
      deps: [MsalService],
      multi: true,
    },
  ],
}
