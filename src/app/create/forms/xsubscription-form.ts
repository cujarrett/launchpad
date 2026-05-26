import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'

@Component({
  selector: 'app-xsubscription-form',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Name <input formControlName="name" /></label>
      <label>Topic Ref (XTopic name) <input formControlName="topicRef" /></label>
      <label>Filter Subject <input formControlName="filterSubject" placeholder=">" /></label>
      <label>Deliver Policy
        <select formControlName="deliverPolicy">
          <option value="all">all</option>
          <option value="new">new</option>
          <option value="last">last</option>
          <option value="lastPerSubject">lastPerSubject</option>
        </select>
      </label>
      <div class="actions">
        <button type="submit" [disabled]="form.invalid">Create</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancel</button>
      </div>
    </form>
  `,
})
export class XSubscriptionForm {
  private readonly fb = inject(FormBuilder)
  readonly tenant = input.required<string>()
  readonly submitted = output<unknown>()
  readonly cancelled = output<void>()

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    topicRef: ['', Validators.required],
    filterSubject: ['>'],
    deliverPolicy: ['all'],
  })

  submit() {
    if (this.form.invalid) return
    const v = this.form.getRawValue()
    this.submitted.emit({
      kind: 'XSubscription',
      name: v.name,
      params: { topicRef: v.topicRef, filterSubject: v.filterSubject, deliverPolicy: v.deliverPolicy },
    })
  }
}
