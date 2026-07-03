import { inject, Injectable } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { Observable } from "rxjs"
import { environment } from "../../../environments/environment"
import { Resource, Workspace } from "../models/workspace.model"

@Injectable({ providedIn: "root" })
export class WorkspaceService {
  private readonly http = inject(HttpClient)

  getWorkspaces(): Observable<Workspace[]> {
    return this.http.get<Workspace[]>(`${environment.apiUrl}/workspaces`)
  }

  getResources(tenant: string): Observable<Resource[]> {
    return this.http.get<Resource[]>(`${environment.apiUrl}/workspaces/${tenant}/resources`)
  }

  createResource(tenant: string, resource: unknown): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/workspaces/${tenant}/resources`, resource)
  }

  deleteResource(tenant: string, name: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/workspaces/${tenant}/resources/${name}`)
  }

  getResourceValues(tenant: string, name: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(
      `${environment.apiUrl}/workspaces/${tenant}/resources/${name}/values`,
    )
  }

  createWorkspace(name: string): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/workspaces`, { name })
  }

  deleteWorkspace(name: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/workspaces/${name}`)
  }

  createGuestWorkspace(name: string): Observable<{ name: string; expiresAt: string }> {
    return this.http.post<{ name: string; expiresAt: string }>(
      `${environment.apiUrl}/guest/workspaces`,
      { name },
    )
  }

  createGuestResourceBatch(
    workspace: string,
    kind: string,
    opts: {
      withCache?: boolean
      withSql?: boolean
      withNoSql?: boolean
      withStorage?: boolean
      withSpa?: boolean
      withApi?: boolean
    } = {},
  ): Observable<void> {
    return this.http.post<void>(
      `${environment.apiUrl}/guest/workspaces/${workspace}/resources/batch`,
      { kind, ...opts },
    )
  }

  recordGuestPhase(workspace: string, phase: string, done = false): void {
    this.http
      .post<void>(`${environment.apiUrl}/guest/workspaces/${workspace}/phases`, { phase, done })
      .subscribe({ error: () => {} })
  }

  patchGuestResourceRefs(
    workspace: string,
    resource: string,
    refs: { withSql: boolean; withCache: boolean },
  ): Observable<void> {
    return this.http.patch<void>(
      `${environment.apiUrl}/guest/workspaces/${workspace}/resources/${resource}`,
      refs,
    )
  }
}
