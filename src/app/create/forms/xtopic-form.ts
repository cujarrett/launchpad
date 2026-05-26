import { ChangeDetectionStrategy, Component, inject, input, output } from "@angular/core"
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms"

@Component({
  selector: "app-xtopic-form",
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Name <input formControlName="name" /></label>
      <label>Stream Name (uppercase, no dots/spaces) <input formControlName="streamName" /></label>
      <label
        >Subjects (comma-separated, supports * and >) <input formControlName="subjects"
      /></label>
      <label
        >Retention
        <select formControlName="retention">
          <option value="limits">limits</option>
          <option value="interest">interest</option>
          <option value="workqueue">workqueue</option>
        </select>
      </label>
      <div class="actions">
        <button type="submit" [disabled]="form.invalid">Create</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancel</button>
      </div>
    </form>
  `,
})
export class XTopicForm {
  private readonly fb = inject(FormBuilder)
  readonly tenant = input.required<string>()
  readonly submitted = output<unknown>()
  readonly cancelled = output<void>()

  form = this.fb.nonNullable.group({
    name: ["", Validators.required],
    streamName: ["", Validators.required],
    subjects: ["", Validators.required],
    retention: ["limits"],
  })

  submit() {
    if (this.form.invalid) return
    const v = this.form.getRawValue()
    this.submitted.emit({
      kind: "XTopic",
      name: v.name,
      params: {
        streamName: v.streamName,
        subjects: v.subjects
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean),
        retention: v.retention,
      },
    })
  }
}
