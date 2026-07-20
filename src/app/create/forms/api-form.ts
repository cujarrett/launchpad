import { ChangeDetectionStrategy, Component, inject, input, output } from "@angular/core"
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms"

@Component({
  selector: "app-api-form",
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Name <input formControlName="name" /></label>
      <label>Image <input formControlName="image" /></label>
      <label>Host (optional) <input formControlName="host" /></label>
      <label>Port <input type="number" formControlName="port" /></label>
      <label>Replicas <input type="number" formControlName="replicas" /></label>

      <fieldset>
        <legend>Integrations (optional — enter resource names)</legend>
        <label>SQL ref <input formControlName="sqlRef" /></label>
        <label>NoSQL ref <input formControlName="nosqlRef" /></label>
        <label>Object Storage ref <input formControlName="objectStorageRef" /></label>
        <label>Topic ref <input formControlName="topicRef" /></label>
        <label>Subscription ref <input formControlName="subscriptionRef" /></label>
        <label class="checkbox-label">
          <input type="checkbox" formControlName="cache" /> Enable cache
        </label>
      </fieldset>

      <div class="actions">
        <button type="submit" [disabled]="form.invalid">Create</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancel</button>
      </div>
    </form>
  `,
})
export class XApiForm {
  private readonly fb = inject(FormBuilder)
  readonly tenant = input.required<string>()
  readonly submitted = output<unknown>()
  readonly cancelled = output<void>()

  form = this.fb.nonNullable.group({
    name: ["", Validators.required],
    image: ["", Validators.required],
    host: [""],
    port: [8080],
    replicas: [1],
    sqlRef: [""],
    nosqlRef: [""],
    objectStorageRef: [""],
    topicRef: [""],
    subscriptionRef: [""],
    cache: [false],
  })

  submit() {
    if (this.form.invalid) return
    const v = this.form.getRawValue()
    const params: Record<string, unknown> = {
      image: v.image,
      port: v.port,
      replicas: v.replicas,
    }
    if (v.host) params["host"] = v.host
    if (v.sqlRef) params["sqlRef"] = v.sqlRef
    if (v.nosqlRef) params["nosqlRef"] = v.nosqlRef
    if (v.objectStorageRef) params["objectStorageRef"] = v.objectStorageRef
    if (v.topicRef) params["topicRef"] = v.topicRef
    if (v.subscriptionRef) params["subscriptionRef"] = v.subscriptionRef
    if (v.cache) params["cache"] = true
    this.submitted.emit({ kind: "Api", name: v.name, params })
  }
}
