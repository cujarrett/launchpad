import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { ResourceKind, RESOURCE_KIND_LABELS } from '../core/models/workspace.model'
import { DynamicForm } from './dynamic-form/dynamic-form'

@Component({
  selector: 'app-create-resource',
  imports: [DynamicForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <h2 style="margin-bottom:1.25rem">New {{ labels[kind()] }}</h2>
      <app-dynamic-form
        [workspace]="workspace()"
        [kind]="kind()"
        (created)="created.emit()"
        (cancelled)="cancelled.emit()"
      />
    </div>
  `,
})
export class CreateResource {
  readonly workspace = input.required<string>()
  readonly kind = input.required<ResourceKind>()
  readonly created = output<void>()
  readonly cancelled = output<void>()

  readonly labels = RESOURCE_KIND_LABELS
}

