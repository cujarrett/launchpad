import { ChangeDetectionStrategy, Component, inject, input, output } from "@angular/core"
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms"

@Component({
  selector: "app-xsql-form",
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Name <input formControlName="name" /></label>
      <label
        >Environment
        <select formControlName="environment">
          <option value="cluster">cluster (in-cluster Postgres)</option>
          <option value="cloud">cloud (AWS RDS)</option>
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
export class XSqlForm {
  private readonly fb = inject(FormBuilder)
  readonly tenant = input.required<string>()
  readonly submitted = output<unknown>()
  readonly cancelled = output<void>()

  form = this.fb.nonNullable.group({
    name: ["", Validators.required],
    environment: ["cluster"],
    dataRetention: ["delete"],
  })

  submit() {
    if (this.form.invalid) return
    const v = this.form.getRawValue()
    this.submitted.emit({
      kind: "XSql",
      name: v.name,
      params: { environment: v.environment, dataRetention: v.dataRetention },
    })
  }
}
