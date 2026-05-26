import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { MsalService, MsalBroadcastService } from "@azure/msal-angular"
import { App } from "./app"

const msalServiceMock = {
  instance: {
    getAllAccounts: () => [],
    getActiveAccount: () => null,
  },
  loginRedirect: () => {},
  logout: () => {},
}

const noopSubscription = { unsubscribe: () => {} }

const msalBroadcastServiceMock = {
  msalSubject$: { pipe: () => ({ subscribe: () => noopSubscription }) },
  inProgress$: { pipe: () => ({ subscribe: () => noopSubscription }) },
}

describe("App", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: MsalService, useValue: msalServiceMock },
        { provide: MsalBroadcastService, useValue: msalBroadcastServiceMock },
      ],
    }).compileComponents()
  })

  it("should create the app", () => {
    const fixture = TestBed.createComponent(App)
    expect(fixture.componentInstance).toBeTruthy()
  })
})
