import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccessService, PermissionDto, SubmoduleDto } from '../../core/access.service';
import { ApiService } from '../../core/api.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../ui/icon';

interface PermissionForm { id?: number; name: string; displayName: string; isActive: boolean; }

/** One sub-module (submenu) with its permissions, including adding several permissions in one go. */
@Component({
  selector: 'app-submodule-detail',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="titles">
          <span class="crumbs"><a routerLink="/admin/modules">System modules</a> /
            <a [routerLink]="['/admin/modules', sub()?.moduleId]">Module</a> / {{ sub()?.name }}</span>
          <h1>{{ sub()?.name }} <span class="muted" style="font-size:1rem;font-weight:500">permissions</span></h1>
        </div>
        <span class="spacer"></span>
        <a class="btn" [routerLink]="['/admin/submodules', subId(), 'role-permission']"><app-icon name="key" [size]="16" /> Role permission</a>
        <button class="btn" (click)="addOne()"><app-icon name="plus" [size]="16" /> Add one</button>
      </div>

      @if (sub(); as s) {
        <div class="card" style="margin-bottom:1rem">
          <div class="row" style="gap:2rem">
            <div><div class="muted small">Route</div><div>{{ s.route }}</div></div>
            <div><div class="muted small">Access name</div><div>{{ s.accessName }}</div></div>
            <div><div class="muted small">Permissions</div><div>{{ items().length }}</div></div>
            <div><div class="muted small">Status</div><span class="badge" [class.ok]="s.isActive" [class.no]="!s.isActive">{{ s.isActive ? 'Active' : 'Inactive' }}</span></div>
          </div>
        </div>

        <!-- add menu permissions in bulk -->
        <div class="card" style="margin-bottom:1rem">
          <h2 style="margin-bottom:.25rem">Add permissions in bulk</h2>
          <p class="muted small" style="margin:0 0 .85rem">Pick the actions people can do on “{{ s.name }}”. Each becomes a permission named
            “{{ s.accessName }}.&lt;action&gt;”. Ones that already exist are skipped.</p>
          <div class="checks">
            @for (a of presets; track a) {
              <label class="check" [class.on]="picked().has(a)">
                <input type="checkbox" [checked]="picked().has(a)" (change)="toggle(a)" /> {{ a }}
              </label>
            }
          </div>
          <div class="row" style="margin-top:.85rem">
            <input type="text" style="max-width:360px" placeholder="Other actions, separated by commas (e.g. Archive, Send email)"
                   [value]="custom()" (input)="custom.set($any($event.target).value)" aria-label="Other actions" />
            <button class="btn primary" (click)="addBulk()" [disabled]="busy() || chosen().length === 0">
              <app-icon name="plus" [size]="16" /> Add {{ chosen().length || '' }} permission{{ chosen().length === 1 ? '' : 's' }}
            </button>
          </div>
        </div>
      }

      @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() }}</div> }

      <div class="card table-card">
        <div class="table-scroll">
          <table class="data">
            <thead><tr><th>Permission</th><th>Display name</th><th>Roles</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { @for (i of [1, 2, 3]; track i) { <tr><td colspan="5"><div class="skeleton" style="height:1.1rem"></div></td></tr> } }
              @for (p of items(); track p.id) {
                <tr>
                  <td><code>{{ p.name }}</code></td>
                  <td>{{ p.displayName }}</td>
                  <td><span class="badge">{{ p.roleCount }}</span></td>
                  <td><span class="badge" [class.ok]="p.isActive" [class.no]="!p.isActive">{{ p.isActive ? 'Active' : 'Inactive' }}</span></td>
                  <td class="actions"><div class="actions-wrap">
                    <button class="btn icon ghost" (click)="edit(p)" aria-label="Edit permission" title="Edit"><app-icon name="edit" [size]="16" /></button>
                    <button class="btn icon ghost danger" (click)="remove(p)" aria-label="Delete permission" title="Delete"><app-icon name="trash" [size]="16" /></button>
                  </div></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (!loading() && items().length === 0) {
          <div class="empty"><div class="ico"><app-icon name="key" [size]="26" /></div><h3>No permissions yet</h3><p>Add some above, for example View, Create, Edit and Delete.</p></div>
        }
      </div>
    </div>

    @if (form(); as f) {
      <div class="backdrop" (click)="form.set(null)">
        <form class="dialog wide" (ngSubmit)="save()" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-label="Permission">
          <h2>{{ f.id ? 'Edit permission' : 'Add permission' }}</h2>
          @if (formError()) { <div class="alert error" role="alert" style="margin-top:.75rem"><app-icon name="alert" />{{ formError() }}</div> }
          <div class="form-grid" style="margin-top:1rem">
            <div class="full"><label class="lbl" for="p-name">Name <span class="req">*</span></label>
              <input id="p-name" name="name" type="text" [(ngModel)]="f.name" required maxlength="150" />
              <div class="hint">Must start with “{{ sub()?.accessName }}.”, for example {{ sub()?.accessName }}.approve</div></div>
            <div class="full"><label class="lbl" for="p-dn">Display name <span class="req">*</span></label>
              <input id="p-dn" name="displayName" type="text" [(ngModel)]="f.displayName" required maxlength="150" /></div>
            <div><label class="row" style="gap:.6rem"><input type="checkbox" name="active" [(ngModel)]="f.isActive" /> <span>Active</span></label></div>
          </div>
          <div class="row" style="justify-content:flex-end;margin-top:1.25rem">
            <button class="btn" type="button" (click)="form.set(null)">Cancel</button>
            <button class="btn primary" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      </div>
    }
  `,
  styles: `code { background: var(--surface-2); padding: .1rem .4rem; border-radius: 5px; font-size: .85em; }`
})
export class SubmoduleDetailPage {
  readonly id = input.required<string>();

  private readonly access = inject(AccessService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly presets = ['View', 'Create', 'Edit', 'Delete', 'Export', 'Print', 'Approve'];
  protected readonly subId = computed(() => Number(this.id()));
  protected readonly sub = signal<SubmoduleDto | null>(null);
  protected readonly items = signal<PermissionDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly picked = signal<ReadonlySet<string>>(new Set(['View', 'Create', 'Edit', 'Delete']));
  protected readonly custom = signal('');
  protected readonly form = signal<PermissionForm | null>(null);
  protected readonly formError = signal('');

  /** The actions that would be added: ticked presets plus the comma-separated extras. */
  protected readonly chosen = computed(() => {
    const extra = this.custom().split(',').map((x) => x.trim()).filter(Boolean);
    return [...new Set([...this.picked(), ...extra])];
  });

  constructor() {
    effect(() => { const id = this.subId(); untracked(() => this.load(id)); });
  }

  private async load(id: number) {
    this.loading.set(true);
    try {
      this.sub.set(await this.access.submodule(id));
      this.items.set(await this.access.permissions(id));
      this.error.set('');
    } catch (e) { this.error.set(ApiService.message(e)); }
    this.loading.set(false);
  }

  protected toggle(action: string) {
    const next = new Set(this.picked());
    if (next.has(action)) next.delete(action); else next.add(action);
    this.picked.set(next);
  }

  protected async addBulk() {
    this.busy.set(true);
    try {
      const res = await this.access.bulkPermissions(this.subId(), this.chosen());
      this.toast.success(`Added ${res.created.length} permission(s)` + (res.skipped.length ? `, skipped ${res.skipped.length} that already exist.` : '.'));
      this.picked.set(new Set());
      this.custom.set('');
      await this.load(this.subId());
    } catch (e) {
      this.toast.error(ApiService.message(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected addOne() {
    this.formError.set('');
    this.form.set({ name: (this.sub()?.accessName ?? '') + '.', displayName: '', isActive: true });
  }

  protected edit(p: PermissionDto) {
    this.formError.set('');
    this.form.set({ id: p.id, name: p.name, displayName: p.displayName, isActive: p.isActive });
  }

  protected async save() {
    const f = this.form();
    if (!f) return;
    this.busy.set(true);
    this.formError.set('');
    try {
      const body = { name: f.name, displayName: f.displayName, isActive: f.isActive };
      if (f.id) await this.access.updatePermission(f.id, body); else await this.access.createPermission(this.subId(), body);
      this.toast.success('Permission saved.');
      this.form.set(null);
      await this.load(this.subId());
    } catch (e) {
      this.formError.set(ApiService.message(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(p: PermissionDto) {
    const ok = await this.confirm.ask(`“${p.name}” will be deleted and taken away from ${p.roleCount} role(s).`,
      { title: 'Delete permission?', confirmText: 'Delete', danger: true });
    if (!ok) return;
    try { await this.access.deletePermission(p.id); this.toast.success('Permission deleted.'); await this.load(this.subId()); }
    catch (e) { this.toast.error(ApiService.message(e)); }
  }
}
