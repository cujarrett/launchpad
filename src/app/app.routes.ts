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
    path: "signed-out",
    loadComponent: () => import("./signed-out/signed-out").then((m) => m.SignedOut),
  },
  {
    path: "**",
    redirectTo: "",
  },
]
