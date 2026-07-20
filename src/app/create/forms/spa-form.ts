import { ChangeDetectionStrategy, Component, inject, input, output } from "@angular/core"
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms"

@Component({
  selector: "app-spa-form",
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Name <input formControlName="name" /></label>
      <label>Image <input formControlName="image" /></label>
      <label>Host <input formControlName="host" /></label>
      <label
        >TLS Issuer
        <select formControlName="tlsIssuer">
          <option value="letsencrypt-prod">letsencrypt-prod</option>
          <option value="letsencrypt-staging">letsencrypt-staging</option>
          <option value="local-lab-ca-issuer">local-lab-ca-issuer</option>
        </select>
      </label>
      <label>Replicas <input type="number" formControlName="replicas" /></label>
      <div class="actions">
        <button type="submit" [disabled]="form.invalid">Create</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancel</button>
      </div>
    </form>
  `,
})
export class SpaForm {
  private readonly fb = inject(FormBuilder)
  readonly tenant = input.required<string>()
  readonly submitted = output<unknown>()
  readonly cancelled = output<void>()

  form = this.fb.nonNullable.group({
    name: ["", Validators.required],
    image: ["", Validators.required],
    host: ["", Validators.required],
    tlsIssuer: ["letsencrypt-prod"],
    replicas: [1],
  })

  submit() {
    if (this.form.invalid) return
    const v = this.form.getRawValue()
    this.submitted.emit({
      kind: "Spa",
      name: v.name,
      params: { image: v.image, host: v.host, tlsIssuer: v.tlsIssuer, replicas: v.replicas },
    })
  }
}
