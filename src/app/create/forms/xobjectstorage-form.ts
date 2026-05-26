import { ChangeDetectionStrategy, Component, inject, input, output } from "@angular/core"
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms"

@Component({
  selector: "app-xobjectstorage-form",
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Name <input formControlName="name" /></label>
      <label>Region <input formControlName="region" /></label>
      <label
        >Data Retention
        <select formControlName="dataRetention">
          <option value="delete">delete</option>
          <option value="retain">retain</option>
        </select>
      </label>
      <div class="actions">
        <button type="submit" [disabled]="form.invalid">Create</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancel</button>
      </div>
    </form>
  `,
})
export class XObjectStorageForm {
  private readonly fb = inject(FormBuilder)
  readonly tenant = input.required<string>()
  readonly submitted = output<unknown>()
  readonly cancelled = output<void>()

  form = this.fb.nonNullable.group({
    name: ["", Validators.required],
    region: ["us-east-1"],
    dataRetention: ["delete"],
  })

  submit() {
    if (this.form.invalid) return
    const v = this.form.getRawValue()
    this.submitted.emit({
      kind: "XObjectStorage",
      name: v.name,
      params: { region: v.region, dataRetention: v.dataRetention },
    })
  }
}
