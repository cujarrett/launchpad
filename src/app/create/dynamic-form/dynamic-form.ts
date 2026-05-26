import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  input,
  OnInit,
  output,
  signal,
} from "@angular/core"
import { toSignal, toObservable } from "@angular/core/rxjs-interop"
import { NgTemplateOutlet } from "@angular/common"
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from "@angular/forms"
import { firstValueFrom, switchMap, catchError, of, timeout } from "rxjs"
import { HttpErrorResponse } from "@angular/common/http"
import { FieldDef, FieldKind } from "../../core/models/field.model"
import { Resource, ResourceKind } from "../../core/models/workspace.model"
import { SchemaService } from "../../core/services/schema.service"
import { WorkspaceService } from "../../core/services/workspace.service"

@Component({
  selector: "app-dynamic-form",
  imports: [ReactiveFormsModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <p class="muted">Loading form…</p>
    } @else {
      @if (valuesLoadError() && mode() === "edit") {
        <p class="field-error" style="margin-bottom:0.75rem">
          Could not load live values from cluster — form is showing last-committed defaults.
        </p>
      }
      <form [formGroup]="formSig()" (ngSubmit)="submit()">
        @if (mode() !== "edit") {
          <div class="field-group">
            <label>
              Name
              <input type="text" formControlName="__name" placeholder="e.g. my-app" />
            </label>
          </div>
        }

        @if (ciFields().length > 0) {
          <div class="ci-context">
            @for (field of ciFields(); track field.key) {
              <div class="ci-field">
                <span class="ci-field-label">{{ field.label }}</span>
                @if (formSig().get(field.key)?.value; as val) {
                  @if (val.toString().startsWith("http")) {
                    <a
                      [href]="val"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="ci-field-link"
                      >{{ val }}</a
                    >
                  } @else {
                    <code class="ci-field-code">{{ val }}</code>
                  }
                } @else {
                  <span class="muted">—</span>
                }
              </div>
            }
          </div>
        }

        <div class="form-fields">
          @for (field of editableFields(); track field.key) {
            @if (field.kind === "sub-object") {
              <fieldset class="sub-group" [formGroupName]="field.key">
                <legend>{{ field.label }}</legend>
                @if (hasEnabledToggle(field)) {
                  <label class="toggle">
                    <input type="checkbox" formControlName="enabled" />
                    Enable {{ field.label }}
                  </label>
                }
                @if (!hasEnabledToggle(field) || isSubObjectEnabled(field.key)) {
                  @for (child of field.children ?? []; track child.key) {
                    @if (child.key !== "enabled") {
                      <label>
                        {{ child.label }}{{ child.required ? " *" : "" }}
                        @switch (child.kind) {
                          @case ("select") {
                            <select [formControlName]="child.key">
                              @if (!child.required) {
                                <option value="">— none —</option>
                              }
                              @for (opt of child.enum ?? []; track opt; let i = $index) {
                                <option [value]="opt">{{ child.enumLabels?.[i] ?? opt }}</option>
                              }
                            </select>
                          }
                          @case ("boolean") {
                            <input type="checkbox" [formControlName]="child.key" />
                          }
                          @case ("number") {
                            <input
                              type="number"
                              [min]="child.minimum ?? 0"
                              [formControlName]="child.key"
                              [placeholder]="child.default?.toString() ?? ''"
                            />
                          }
                          @default {
                            <input
                              type="text"
                              [formControlName]="child.key"
                              [placeholder]="child.default?.toString() ?? ''"
                            />
                          }
                        }
                      </label>
                    }
                  }
                }
              </fieldset>
            } @else {
              <div class="field-group">
                <label>
                  <span class="field-label-row">
                    {{ field.label }}{{ field.required ? " *" : "" }}
                    @if (field.description) {
                      <span class="hint-icon" [title]="field.description">ⓘ</span>
                    }
                  </span>
                  <ng-container
                    [ngTemplateOutlet]="fieldInput"
                    [ngTemplateOutletContext]="{
                      field: field,
                      controlName: field.key,
                      fullControlName: field.key,
                    }"
                  />
                </label>
              </div>
            }
          }
        </div>

        @if (connectionFields().length > 0 && (!readonly() || shownConnectionFields().length > 0)) {
          <div class="connections-section">
            <div class="connections-header">
              <span class="connections-label">Resource Integrations</span>
              @if (
                availableConnectionFields().length > 0 && (!readonly() || connectionsEditable())
              ) {
                <div class="connection-add-row">
                  <button
                    type="button"
                    class="btn-add-connection"
                    (click)="
                      showConnectionPicker.set(!showConnectionPicker()); $event.stopPropagation()
                    "
                    title="Add integration"
                  >
                    +
                  </button>
                  @if (showConnectionPicker()) {
                    <div class="connection-picker" (click)="$event.stopPropagation()">
                      @for (f of availableConnectionFields(); track f.key) {
                        <button type="button" class="picker-opt" (click)="addConnection(f.key)">
                          {{ f.label }}
                        </button>
                      }
                    </div>
                  }
                </div>
              }
            </div>
            @for (field of shownConnectionFields(); track field.key) {
              @if (field.kind === "resource-ref") {
                <div class="connection-row">
                  <span class="connection-type">{{ field.label }}</span>
                  <select [formControlName]="field.key">
                    <option value="">— select —</option>
                    @for (r of refsFor(field.refKind!); track r.name) {
                      <option [value]="r.name">{{ r.name }}</option>
                    }
                  </select>
                  @if (!readonly()) {
                    <button
                      type="button"
                      class="btn-new-ref"
                      (click)="requestCreate.emit(field.refKind!)"
                    >
                      + New
                    </button>
                  }
                  @if (!readonly() || connectionsEditable()) {
                    <button
                      type="button"
                      class="btn-remove-conn"
                      (click)="removeConnection(field.key)"
                      title="Remove"
                    >
                      ×
                    </button>
                  }
                </div>
              } @else if (field.kind === "sub-object") {
                <div class="connection-row sub-object-conn" [formGroupName]="field.key">
                  <span class="connection-type">{{ field.label }}</span>
                  <div class="connection-sub-controls">
                    @for (child of field.children ?? []; track child.key) {
                      @if (child.key !== "enabled") {
                        <label class="inline-label">
                          {{ child.label }}
                          @if (child.kind === "select") {
                            <select [formControlName]="child.key">
                              @for (opt of child.enum ?? []; track opt; let i = $index) {
                                <option [value]="opt">{{ child.enumLabels?.[i] ?? opt }}</option>
                              }
                            </select>
                          } @else {
                            <input type="text" [formControlName]="child.key" />
                          }
                        </label>
                      }
                    }
                  </div>
                  @if (!readonly() || connectionsEditable()) {
                    <button
                      type="button"
                      class="btn-remove-conn"
                      (click)="removeConnection(field.key)"
                      title="Remove"
                    >
                      ×
                    </button>
                  }
                </div>
              }
            }
          </div>
        }

        @if (advancedFields().length > 0) {
          <details class="advanced-fields">
            <summary>Advanced</summary>
            <div class="form-fields">
              @for (field of advancedFields(); track field.key) {
                <div class="field-group">
                  <label>
                    <span class="field-label-row">
                      {{ field.label }}{{ field.required ? " *" : "" }}
                      @if (field.description) {
                        <span class="hint-icon" [title]="field.description">ⓘ</span>
                      }
                    </span>
                    <ng-container
                      [ngTemplateOutlet]="fieldInput"
                      [ngTemplateOutletContext]="{
                        field: field,
                        controlName: field.key,
                        fullControlName: field.key,
                      }"
                    />
                  </label>
                </div>
              }
            </div>
          </details>
        }

        <div class="form-actions">
          @if (!readonly()) {
            <button type="submit" [disabled]="formSig().invalid || submitting()">
              {{
                submitting()
                  ? mode() === "edit"
                    ? "Saving…"
                    : "Creating…"
                  : mode() === "edit"
                    ? "Save"
                    : "Create"
              }}
            </button>
          }
          <button type="button" class="secondary" (click)="cancelled.emit()">
            {{ readonly() ? "Close" : "Cancel" }}
          </button>
        </div>
        @if (saveError()) {
          <p class="field-error" style="margin-top: 0.5rem">{{ saveError() }}</p>
        }

        <ng-template
          #fieldInput
          let-field="field"
          let-controlName="controlName"
          let-fullControlName="fullControlName"
        >
          @switch (field.kind) {
            @case ("select") {
              <select [formControlName]="controlName">
                @if (!field.required) {
                  <option value="">— none —</option>
                }
                @for (opt of field.enum ?? []; track opt; let i = $index) {
                  <option [value]="opt">{{ field.enumLabels?.[i] ?? opt }}</option>
                }
              </select>
            }
            @case ("boolean") {
              <input type="checkbox" [formControlName]="controlName" />
            }
            @case ("number") {
              <input
                type="number"
                [min]="field.minimum ?? 0"
                [formControlName]="controlName"
                [placeholder]="field.default?.toString() ?? ''"
              />
            }
            @case ("array") {
              <textarea
                [formControlName]="controlName"
                rows="3"
                placeholder="One entry per line"
              ></textarea>
            }
            @case ("resource-ref") {
              <select [formControlName]="controlName">
                <option value="">— select —</option>
                @for (r of refsFor(field.refKind!); track r.name) {
                  <option [value]="r.name">{{ r.name }}</option>
                }
              </select>
            }
            @default {
              <input
                type="text"
                [formControlName]="controlName"
                [placeholder]="field.default?.toString() ?? ''"
              />
              @if (
                formSig().get(fullControlName)?.hasError("pattern") &&
                formSig().get(fullControlName)?.touched
              ) {
                <span class="field-error">Invalid format — e.g. {{ field.default }}</span>
              }
            }
          }
        </ng-template>
      </form>
    }
  `,
})
export class DynamicForm implements OnInit {
  readonly workspace = input.required<string>()
  readonly kind = input.required<ResourceKind>()
  /** 'edit' pre-populates the form and locks the name field. */
  readonly mode = input<"create" | "edit">("create")
  /** When true, the form is view-only: save button is hidden and the form cannot be submitted. */
  readonly readonly = input<boolean>(false)
  /** When true, the connections section remains editable even in readonly mode (guest sandbox). */
  readonly connectionsEditable = input<boolean>(false)
  /** Live spec.parameters from the cluster, used to pre-populate in edit mode. */
  readonly initialValues = input<Record<string, unknown> | null>(null)
  /** When set, the name field is pre-filled and made read-only. */
  readonly resourceName = input<string | null>(null)
  /** When true, skips the live-values fetch (e.g. resource not yet on cluster). */
  readonly skipLiveValues = input<boolean>(false)

  readonly created = output<void>()
  readonly cancelled = output<void>()
  readonly requestCreate = output<ResourceKind>()
  readonly connectionsChanged = output<{ withSql: boolean; withCache: boolean }>()

  private readonly schemaService = inject(SchemaService)
  private readonly workspaceService = inject(WorkspaceService)

  // Schema fields loaded via toSignal — properly integrated with Angular's zoneless scheduler
  protected readonly fields = toSignal(
    toObservable(this.kind).pipe(
      switchMap((kind) =>
        this.schemaService.getFields(kind).pipe(
          timeout(8000),
          catchError(() => of([] as FieldDef[])),
        ),
      ),
    ),
  )

  protected readonly normalFields = computed(() =>
    (this.fields() ?? []).filter((f) => !f.advanced && !f.connection),
  )
  protected readonly ciFields = computed(() =>
    this.normalFields().filter((f) => f.kind === "display"),
  )
  protected readonly editableFields = computed(() =>
    this.normalFields().filter((f) => f.kind !== "display"),
  )
  protected readonly advancedFields = computed(() =>
    (this.fields() ?? []).filter((f) => f.advanced),
  )

  protected readonly connectionFields = computed(() =>
    (this.fields() ?? []).filter((f) => !!f.connection),
  )
  protected readonly showConnectionPicker = signal(false)

  @HostListener("document:click")
  closeConnectionPicker() {
    this.showConnectionPicker.set(false)
  }

  private readonly extraKeys = signal<Set<string>>(new Set())
  private readonly hiddenKeys = signal<Set<string>>(new Set())

  private readonly prePopulatedKeys = computed((): Set<string> => {
    const fields = this.fields()
    const values = this.loadedValues()
    if (!fields?.length || !values) return new Set()
    const s = new Set<string>()
    for (const f of fields) {
      if (!f.connection) continue
      if (f.kind === "resource-ref" && values[f.key]) s.add(f.key)
      if (f.kind === "sub-object") {
        if ((values[f.key] as Record<string, unknown> | undefined)?.["enabled"] === true)
          s.add(f.key)
      }
    }
    return s
  })

  protected readonly shownConnectionFields = computed(() => {
    const extra = this.extraKeys()
    const hidden = this.hiddenKeys()
    const pre = this.prePopulatedKeys()
    return this.connectionFields().filter(
      (f) => !hidden.has(f.key) && (pre.has(f.key) || extra.has(f.key)),
    )
  })

  protected readonly availableConnectionFields = computed(() => {
    const shown = new Set(this.shownConnectionFields().map((f) => f.key))
    const existing = this.existingResources()
    return this.connectionFields().filter((f) => {
      if (shown.has(f.key)) return false
      if (f.kind === "resource-ref") return existing.some((r) => r.kind === f.refKind)
      return true
    })
  })

  // null = values not yet loaded; {} = loaded (may have valuesLoadError)
  private readonly loadedValues = signal<Record<string, unknown> | null>(null)

  protected readonly existingResources = signal<Resource[]>([])
  protected readonly valuesLoadError = signal(false)
  protected readonly submitting = signal(false)
  protected readonly saveError = signal<string | null>(null)

  // loading until both schema AND values are ready
  protected readonly loading = computed(
    () => this.fields() === undefined || this.loadedValues() === null,
  )

  // FormGroup derived from fields + values; memoized by computed so it's only rebuilt once
  protected readonly formSig = computed<FormGroup>(() => {
    const fields = this.fields()
    const values = this.loadedValues()
    if (!fields?.length || values === null) {
      return new FormGroup({ __name: new FormControl("", Validators.required) })
    }
    const form = buildForm(fields, values, this.resourceName())
    if (this.readonly()) {
      form.disable()
      if (this.connectionsEditable()) {
        for (const f of fields.filter((field) => !!field.connection)) {
          form.get(f.key)?.enable()
        }
      }
    }
    return form
  })

  async ngOnInit() {
    const valuesPromise: Promise<Record<string, unknown>> =
      this.mode() === "edit" && this.resourceName() && !this.skipLiveValues()
        ? firstValueFrom(
            this.workspaceService.getResourceValues(this.workspace(), this.resourceName()!),
          ).catch((): Record<string, unknown> => {
            this.valuesLoadError.set(true)
            return {}
          })
        : Promise.resolve(this.initialValues() ?? {})

    const [resources, values] = await Promise.all([
      firstValueFrom(
        this.workspaceService.getResources(this.workspace()).pipe(timeout(8000)),
      ).catch((): Resource[] => []),
      valuesPromise,
    ])

    this.existingResources.set(resources)
    this.loadedValues.set(values)
  }

  protected hasEnabledToggle(field: FieldDef): boolean {
    return field.children?.some((c) => c.key === "enabled" && c.kind === "boolean") ?? false
  }

  protected isSubObjectEnabled(key: string): boolean {
    if (this.formSig().get(`${key}.enabled`)?.value === true) return true
    // In edit mode, if the API failed to return values, fall back to showing
    // all sub-object fields so the user isn't silently shown stale defaults.
    if (this.mode() === "edit" && this.valuesLoadError()) return true
    return false
  }

  protected refsFor(kind: ResourceKind): Resource[] {
    return this.existingResources().filter((r) => r.kind === kind)
  }

  protected addConnection(key: string) {
    const field = this.connectionFields().find((f) => f.key === key)!
    if (field.kind === "sub-object") {
      this.formSig().get(`${key}.enabled`)?.setValue(true)
    }
    this.extraKeys.update((s) => new Set([...s, key]))
    this.hiddenKeys.update((s) => {
      const n = new Set(s)
      n.delete(key)
      return n
    })
    this.showConnectionPicker.set(false)
    if (this.connectionsEditable()) this.emitConnectionsChanged()
  }

  protected removeConnection(key: string) {
    const field = this.connectionFields().find((f) => f.key === key)!
    if (field.kind === "sub-object") {
      this.formSig().get(`${key}.enabled`)?.setValue(false)
    } else {
      this.formSig().get(key)?.setValue("")
    }
    this.hiddenKeys.update((s) => new Set([...s, key]))
    this.extraKeys.update((s) => {
      const n = new Set(s)
      n.delete(key)
      return n
    })
    if (this.connectionsEditable()) this.emitConnectionsChanged()
  }

  private emitConnectionsChanged() {
    const shown = new Set(this.shownConnectionFields().map((f) => f.key))
    this.connectionsChanged.emit({
      withSql: shown.has("sqlRef"),
      withCache: shown.has("cache"),
    })
  }

  async submit() {
    if (this.formSig().invalid) return
    this.submitting.set(true)
    this.saveError.set(null)
    try {
      const raw = this.formSig().getRawValue() as Record<string, unknown>
      const name = raw["__name"] as string
      const params = buildParams(raw, this.fields() ?? [])
      await firstValueFrom(
        this.workspaceService.createResource(this.workspace(), { kind: this.kind(), name, params }),
      )
      this.created.emit()
    } catch (err: unknown) {
      const detail =
        err instanceof HttpErrorResponse
          ? typeof err.error === "string" && err.error.trim()
            ? err.error.trim()
            : `HTTP ${err.status}`
          : err instanceof Error
            ? err.message
            : ""
      this.saveError.set(
        detail ? `Save failed: ${detail}` : "Save failed. Check your inputs and try again.",
      )
    } finally {
      this.submitting.set(false)
    }
  }
}

// Builds a ReactiveForm from FieldDef[], optionally pre-populated with initial values.
function buildForm(
  fields: FieldDef[],
  initial: Record<string, unknown> = {},
  name: string | null = null,
): FormGroup {
  const nameCtrl = name
    ? new FormControl({ value: name, disabled: true }, Validators.required)
    : new FormControl("", Validators.required)

  const controls: Record<string, FormControl | FormGroup> = { __name: nameCtrl }

  for (const field of fields) {
    if (field.kind === "sub-object") {
      const subInitial = (initial[field.key] ?? {}) as Record<string, unknown>
      const sub: Record<string, FormControl> = {}
      for (const child of field.children ?? []) {
        sub[child.key] = makeControl(child, subInitial[child.key])
      }
      controls[field.key] = new FormGroup(sub)
    } else if (field.kind === "display") {
      controls[field.key] = new FormControl({ value: initial[field.key] ?? "", disabled: true })
    } else {
      controls[field.key] = makeControl(field, initial[field.key])
    }
  }

  return new FormGroup(controls)
}

function makeControl(field: FieldDef, initialValue?: unknown): FormControl {
  let v: unknown
  if (initialValue !== undefined && initialValue !== null) {
    if (field.kind === "array" && Array.isArray(initialValue)) {
      v = initialValue.join("\n")
    } else if (field.kind === "resource-ref" && typeof initialValue === "object") {
      v = (initialValue as Record<string, unknown>)["name"] ?? ""
    } else {
      v = initialValue
    }
  } else {
    v = field.default ?? (field.kind === "boolean" ? false : "")
  }
  const validators = [
    ...(field.required && field.kind !== "boolean" ? [Validators.required] : []),
    ...(field.pattern ? [Validators.pattern(field.pattern)] : []),
  ]
  return new FormControl(v, validators)
}

// Converts flat form values back into the nested params shape the BFF expects.
function buildParams(raw: Record<string, unknown>, fields: FieldDef[]): Record<string, unknown> {
  const params: Record<string, unknown> = {}

  for (const field of fields) {
    const val = raw[field.key]
    if (val === "" || val === null || val === undefined) continue

    if (field.kind === "resource-ref") {
      // render templates expect the string name directly: `name: {{ .Params.sqlRef }}`
      params[field.key] = val
    } else if (field.kind === "sub-object") {
      const subRaw = val as Record<string, unknown>
      const hasEnabled = field.children?.some((c) => c.key === "enabled")
      if (hasEnabled && subRaw["enabled"] !== true) continue
      const sub: Record<string, unknown> = {}
      for (const child of field.children ?? []) {
        const cv = subRaw[child.key]
        if (cv !== "" && cv !== null && cv !== undefined) sub[child.key] = cv
      }
      if (Object.keys(sub).length > 0) params[field.key] = sub
    } else if (field.kind === "array") {
      const lines = (val as string)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
      if (lines.length > 0) params[field.key] = lines
    } else {
      params[field.key] = val
    }
  }

  return params
}
