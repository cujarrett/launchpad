import { inject, Injectable } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { Observable } from "rxjs"
import { environment } from "../../../environments/environment"

@Injectable({ providedIn: "root" })
export class CreateService {
  private readonly http = inject(HttpClient)

  createResource(tenant: string, payload: unknown): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/workspaces/${tenant}/resources`, payload)
  }
}
