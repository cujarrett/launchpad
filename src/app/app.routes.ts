import { Routes } from "@angular/router"

export const routes: Routes = [
  {
    path: "",
    loadComponent: () => import("./workspaces/workspaces").then((m) => m.Workspaces),
  },
  {
    path: "workspaces/:name",
    loadComponent: () =>
      import("./workspaces/workspace-detail/workspace-detail").then((m) => m.WorkspaceDetail),
  },
  {
    path: "how-it-works",
    loadComponent: () => import("./how-it-works/how-it-works").then((m) => m.HowItWorks),
  },
  {
    path: "signed-out",
    loadComponent: () => import("./signed-out/signed-out").then((m) => m.SignedOut),
  },
  {
    path: "**",
    redirectTo: "",
  },
]
