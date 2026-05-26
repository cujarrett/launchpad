import { ChangeDetectionStrategy, Component, computed, input, OnInit, output, signal } from '@angular/core'
import { inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { HttpErrorResponse } from '@angular/common/http'
import { WorkspaceService } from '../../core/services/workspace.service'
import { Resource, ResourceKind, RESOURCE_KIND_ICONS, RESOURCE_KIND_LABELS } from '../../core/models/workspace.model'

// Kinds available to guests — XWordpress excluded (production data risk),
// XSubscription excluded (requires existing topic), XSql locked to cluster backend.
const GUEST_KINDS: ResourceKind[] = ['XApi', 'XSpa', 'XSql', 'XNoSql', 'XObjectStorage']

const GUEST_KIND_DESC: Record<ResourceKind, string> = {
  XApi:           'REST API with HTTPS.',
  XSpa:           'Static frontend app served over HTTPS.',
  XSql:           'Relational database.',
  XNoSql:         'NoSQL key-value store. Fast lookups, flexible schemas.',
  XObjectStorage: 'Object storage for files, assets, and blobs.',
  XTopic:         '',
  XSubscription:  '',
  XWordpress:     '',
}

@Component({
  selector: 'app-guest-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="guest-create-panel">
      <h3>Add a resource</h3>

      @if (existingResources().length > 0) {
        <div class="existing-section">
          <span class="section-label">Already in this workspace:</span>
          <div class="existing-chips">
            @for (r of existingResources(); track r.name) {
              <span class="chip">{{ icons[r.kind] }} {{ labels[r.kind] }}</span>
            }
          </div>
        </div>
      }

      <div class="kind-grid">
        @for (k of guestKinds; track k) {
          <button
            class="kind-card"
            type="button"
            [class.selected]="selectedKind() === k"
            (click)="selectedKind.set(k)"
          >
            <span class="kind-icon">{{ icons[k] }}</span>
            <span class="kind-name">{{ labels[k] }}</span>
            <span class="kind-desc">{{ kindDesc[k] }}</span>
          </button>
        }
      </div>

      @if (selectedKind() === 'XApi') {
        <div class="options-section">
          <span class="options-label">Configure API</span>
          @if (showSqlToggle()) {
            <label class="bundle-toggle">
              <input type="checkbox" [checked]="withSql()" (change)="withSql.set(!withSql())" />
              <span>Connect to existing SQL database</span>
              <span class="bundle-desc">Wire your API to the SQL database already in this workspace.</span>
            </label>
          }
          @if (offerSql()) {
            <label class="bundle-toggle">
              <input type="checkbox" [checked]="withSql()" (change)="withSql.set(!withSql())" />
              <span>Also provision SQL database</span>
              <span class="bundle-desc">Creates a relational database and wires it to your API.</span>
            </label>
          }
          @if (offerNoSql()) {
            <label class="bundle-toggle">
              <input type="checkbox" [checked]="withNoSql()" (change)="withNoSql.set(!withNoSql())" />
              <span>Also provision NoSQL database</span>
              <span class="bundle-desc">Creates a key-value store and wires it to your API.</span>
            </label>
          }
          @if (offerStorage()) {
            <label class="bundle-toggle">
              <input type="checkbox" [checked]="withStorage()" (change)="withStorage.set(!withStorage())" />
              <span>Also provision object storage</span>
              <span class="bundle-desc">A managed store for files and blobs, wired to your API.</span>
            </label>
          }
          <label class="bundle-toggle">
            <input type="checkbox" [checked]="withCache()" (change)="withCache.set(!withCache())" />
            <span>Add in-cluster cache</span>
            <span class="bundle-desc">In-cluster Redis wired to your API via service binding.</span>
          </label>
        </div>
      }

      @if (error()) {
        <p class="field-error">{{ error() }}</p>
      }

      <div class="form-actions">
        <button
          [disabled]="saving() || !selectedKind()"
          (click)="submit()"
        >
          {{ saving() ? 'Creating\u2026' : 'Create' }}
        </button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancel</button>
      </div>
    </div>
  `,
  styles: [`
    .guest-create-panel { padding: 1.5rem; }
    h3 { margin: 0 0 1rem; }
    .existing-section {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 1.25rem;
    }
    .section-label { font-size: 0.8rem; opacity: 0.6; white-space: nowrap; }
    .existing-chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .chip {
      font-size: 0.8rem;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
    }
    .kind-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .kind-card {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
      padding: 0.75rem;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
      transition: border-color 0.15s, background 0.15s;
    }
    .kind-card:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.25); }
    .kind-card.selected { border-color: #7c3aed; background: rgba(124,58,237,0.15); }
    .kind-icon { font-size: 1.4rem; line-height: 1; }
    .kind-name { font-size: 0.875rem; font-weight: 600; }
    .kind-desc { font-size: 0.75rem; opacity: 0.6; line-height: 1.3; }
    .options-section {
      border-top: 1px solid rgba(255,255,255,0.1);
      margin-top: 0.25rem;
      padding-top: 1rem;
      margin-bottom: 1rem;
    }
    .options-label {
      display: block;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      opacity: 0.45;
      margin-bottom: 0.75rem;
    }
    .bundle-toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      cursor: pointer;
      margin-bottom: 1rem;
      padding: 0.5rem 0.75rem;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      font-size: 0.875rem;
    }
    .bundle-toggle input { cursor: pointer; }
    .bundle-desc { font-size: 0.75rem; opacity: 0.55; flex-basis: 100%; padding-left: 1.4rem; }
  `],
})
export class GuestCreate implements OnInit {
  readonly workspace = input.required<string>()
  readonly existingResources = input<Resource[]>([])
  readonly created = output<void>()
  readonly cancelled = output<void>()

  private readonly workspaceService = inject(WorkspaceService)

  protected readonly guestKinds = GUEST_KINDS
  protected readonly labels = RESOURCE_KIND_LABELS
  protected readonly icons = RESOURCE_KIND_ICONS
  protected readonly kindDesc = GUEST_KIND_DESC

  protected readonly selectedKind = signal<ResourceKind | ''>('')
  protected readonly saving = signal(false)
  protected readonly error = signal<string | null>(null)
  protected readonly withStorage = signal(false)
  protected readonly withCache = signal(false)
  protected readonly withSql = signal(false)
  protected readonly withNoSql = signal(false)

  protected readonly offerStorage = computed(() => {
    if (this.selectedKind() !== 'XApi') return false
    return !this.existingResources().some(r => r.kind === 'XObjectStorage')
  })

  protected readonly offerSql = computed(() =>
    this.selectedKind() === 'XApi' && !this.existingResources().some(r => r.kind === 'XSql')
  )

  protected readonly offerNoSql = computed(() =>
    this.selectedKind() === 'XApi' && !this.existingResources().some(r => r.kind === 'XNoSql')
  )

  protected readonly showSqlToggle = computed(() =>
    this.selectedKind() === 'XApi' && this.existingResources().some(r => r.kind === 'XSql')
  )

  ngOnInit(): void {}

  protected async submit(): Promise<void> {
    const kind = this.selectedKind()
    if (!kind) return
    this.saving.set(true)
    this.error.set(null)
    try {
      // Provision object storage before XApi so the XApi creation sees it in
      // existingFiles and wires objectStorageRef on the first render — no
      // re-render pass needed and no risk of accidentally dropping the cache.
      if (this.withStorage() && kind === 'XApi') {
        await firstValueFrom(
          this.workspaceService.createGuestResource(this.workspace(), 'XObjectStorage'),
        )
      }
      if (this.withSql() && this.offerSql() && kind === 'XApi') {
        await firstValueFrom(
          this.workspaceService.createGuestResource(this.workspace(), 'XSql'),
        )
      }
      if (this.withNoSql() && kind === 'XApi') {
        await firstValueFrom(
          this.workspaceService.createGuestResource(this.workspace(), 'XNoSql'),
        )
      }
      await firstValueFrom(
        this.workspaceService.createGuestResource(this.workspace(), kind, this.withCache(), this.withSql()),
      )
      this.created.emit()
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        this.error.set(e.error ?? e.message)
      } else {
        this.error.set('Unexpected error creating resource')
      }
    } finally {
      this.saving.set(false)
    }
  }
}
