import { ChangeDetectionStrategy, Component, inject, input, output } from "@angular/core"
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms"

@Component({
  selector: "app-xnosql-form",
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Name <input formControlName="name" /></label>
      <label>Partition Key <input formControlName="partitionKey" /></label>
      <label
        >Partition Key Type
        <select formControlName="partitionKeyType">
          <option value="S">S (String)</option>
          <option value="N">N (Number)</option>
          <option value="B">B (Binary)</option>
        </select>
      </label>
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
export class XNoSqlForm {
  private readonly fb = inject(FormBuilder)
  readonly tenant = input.required<string>()
  readonly submitted = output<unknown>()
  readonly cancelled = output<void>()

  form = this.fb.nonNullable.group({
    name: ["", Validators.required],
    partitionKey: ["id"],
    partitionKeyType: ["S"],
    dataRetention: ["delete"],
  })

  submit() {
    if (this.form.invalid) return
    const v = this.form.getRawValue()
    this.submitted.emit({
      kind: "XNoSql",
      name: v.name,
      params: {
        partitionKey: v.partitionKey,
        partitionKeyType: v.partitionKeyType,
        dataRetention: v.dataRetention,
      },
    })
  }
}
