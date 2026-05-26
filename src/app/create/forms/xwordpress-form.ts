import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'

@Component({
  selector: 'app-xwordpress-form',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Name <input formControlName="name" /></label>
      <label>Host <input formControlName="host" /></label>
      <label>Storage Size <input formControlName="storageSize" /></label>
      <label>DB Storage Size <input formControlName="dbStorageSize" /></label>
      <label>Data Retention
        <select formControlName="dataRetention">
          <option value="retain">retain</option>
          <option value="delete">delete</option>
        </select>
      </label>
      <div class="actions">
        <button type="submit" [disabled]="form.invalid">Create</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancel</button>
      </div>
    </form>
  `,
})
export class XWordPressForm {
  private readonly fb = inject(FormBuilder)
  readonly tenant = input.required<string>()
  readonly submitted = output<unknown>()
  readonly cancelled = output<void>()

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    host: ['', Validators.required],
    storageSize: ['10Gi'],
    dbStorageSize: ['5Gi'],
    dataRetention: ['retain'],
  })

  submit() {
    if (this.form.invalid) return
    const v = this.form.getRawValue()
    this.submitted.emit({
      kind: 'XWordpress',
      name: v.name,
      params: { host: v.host, storageSize: v.storageSize, dbStorageSize: v.dbStorageSize, dataRetention: v.dataRetention },
    })
  }
}
