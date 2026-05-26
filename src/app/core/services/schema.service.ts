import { inject, Injectable } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { map, Observable, of, tap } from "rxjs"
import { environment } from "../../../environments/environment"
import { FieldDef, parseSchema } from "../models/field.model"
import { ResourceKind } from "../models/workspace.model"

@Injectable({ providedIn: "root" })
export class SchemaService {
  private readonly http = inject(HttpClient)
  private readonly cache = new Map<ResourceKind, FieldDef[]>()

  getFields(kind: ResourceKind): Observable<FieldDef[]> {
    const cached = this.cache.get(kind)
    if (cached) return of(cached)

    return this.http.get<Record<string, unknown>>(`${environment.apiUrl}/schema/${kind}`).pipe(
      map(parseSchema),
      tap((fields) => this.cache.set(kind, fields)),
    )
  }
}
