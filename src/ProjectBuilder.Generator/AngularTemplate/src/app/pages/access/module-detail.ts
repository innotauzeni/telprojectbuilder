import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccessService, ModuleDto, SubmoduleDto, SubmoduleInput } from '../../core/access.service';
import { ApiService } from '../../core/api.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { ICON_NAMES, Icon } from '../../ui/icon';

interface SubmoduleForm extends SubmoduleInput { id?: number; }

/** One module with its sub-modules (the submenu). */
@Component({
  selector: 'app-module-detail',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="titles">
          <span class="crumbs"><a routerLink="/admin/modules">System modules</a> / {{ module()?.name }}</span>
          <h1>{{ module()?.name }}</h1>
        </div>
        <span class="spacer"></span>
        <a class="btn" [routerLink]="['/admin/modules', moduleId(), 'menu-permission']"><app-icon name="list" [size]="16" /> Menu permission</a>
        <button class="btn primary" (click)="add()"><app-icon name="plus" [size]="16" /> Add sub-module</button>
      </div>

      @if (module(); as m) {
        <div class="card" style="margin-bottom:1rem">
          <div class="row" style="gap:2rem">
            <div><div class="muted small">Slug</div><div>{{ m.slugname }}</div></div>
            <div><div class="muted small">Access name</div><div>{{ m.accessName || '—' }}</div></div>
            <div><div class="muted small">Roles that see it</div><div>{{ m.roleCount }}</div></div>
            <div><div class="muted small">Status</div><span class="badge" [class.ok]="m.isActive" [class.no]="!m.isActive">{{ m.isActive ? 'Active' : 'Inactive' }}</span></div>
            @if (m.description) { <div><div class="muted small">Description</div><div>{{ m.description }}</div></div> }
          </div>
        </div>
      }

      @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() }}</div> }

      <div class="card table-card">
        <div class="table-scroll">
          <table class="data">
            <thead><tr><th>Sub-module</th><th>Route</th><th>Access name</th><th>Permissions</th><th>Order</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { @for (i of [1, 2, 3]; track i) { <tr><td colspan="7"><div class="skeleton" style="height:1.1rem"></div></td></tr> } }
              @for (s of items(); track s.id) {
                <tr>
                  <td><div class="row" style="flex-wrap:nowrap">
                    <span class="chip" style="display:inline-grid;place-items:center;width:30px;height:30px;padding:0"><app-icon [name]="s.icon || 'table'" [size]="16" /></span>
                    <a [routerLink]="['/admin/submodules', s.id]" style="font-weight:600">{{ s.name }}</a></div></td>
                  <td class="muted">{{ s.route }}</td>
                  <td class="muted">{{ s.accessName }}</td>
                  <td><span class="badge">{{ s.permissionCount }}</span></td>
                  <td>{{ s.order }}</td>
                  <td><span class="badge" [class.ok]="s.isActive" [class.no]="!s.isActive">{{ s.isActive ? 'Active' : 'Inactive' }}</span></td>
                  <td class="actions"><div class="actions-wrap">
                    <a class="btn sm" [routerLink]="['/admin/submodules', s.id]"><app-icon name="eye" [size]="14" /> View details</a>
                    <a class="btn sm" [routerLink]="['/admin/submodules', s.id, 'role-permission']"><app-icon name="key" [size]="14" /> Role permission</a>
                    <button class="btn icon ghost" (click)="edit(s)" aria-label="Edit sub-module" title="Edit"><app-icon name="edit" [size]="16" /></button>
                    <button class="btn icon ghost danger" (click)="remove(s)" aria-label="Delete sub-module" title="Delete"><app-icon name="trash" [size]="16" /></button>
                  </div></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (!loading() && items().length === 0) {
          <div class="empty"><div class="ico"><app-icon name="list" [size]="26" /></div><h3>No sub-modules yet</h3><p>Add a screen to this menu.</p></div>
        }
      </div>
    </div>

    @if (form(); as f) {
      <div class="backdrop" (click)="form.set(null)">
        <form class="dialog wide" (ngSubmit)="save()" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-label="Sub-module">
          <h2>{{ f.id ? 'Edit sub-module' : 'Add sub-module' }}</h2>
          @if (formError()) { <div class="alert error" role="alert" style="margin-top:.75rem"><app-icon name="alert" />{{ formError() }}</div> }
          <div class="form-grid" style="margin-top:1rem">
            <div><label class="lbl" for="s-name">Name <span class="req">*</span></label>
              <input id="s-name" name="name" type="text" [(ngModel)]="f.name" required maxlength="100" /></div>
            <div><label class="lbl" for="s-access">Access name <span class="req">*</span></label>
              <input id="s-access" name="access" type="text" [(ngModel)]="f.accessName" required maxlength="100" pattern="[a-z0-9\\-_]+" />
              <div class="hint">Its permissions are named “{{ f.accessName || 'access-name' }}.view”, “….create” …</div></div>
            <div class="full"><label class="lbl" for="s-route">Route <span class="req">*</span></label>
              <input id="s-route" name="route" type="text" [(ngModel)]="f.route" required maxlength="200" placeholder="/e/students" /></div>
            <div><label class="lbl" for="s-icon">Icon</label>
              <select id="s-icon" name="icon" [(ngModel)]="f.icon">@for (n of icons; track n) { <option [value]="n">{{ n }}</option> }</select></div>
            <div><label class="lbl" for="s-order">Order</label><input id="s-order" name="order" type="number" [(ngModel)]="f.order" /></div>
            <div><label class="lbl">Status</label>
              <label class="row" style="gap:.6rem;padding:.4rem 0"><input type="checkbox" name="active" [(ngModel)]="f.isActive" /> <span class="muted">Active</span></label></div>
          </div>
          <div class="row" style="justify-content:flex-end;margin-top:1.25rem">
            <button class="btn" type="button" (click)="form.set(null)">Cancel</button>
            <button class="btn primary" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      </div>
    }
  `
})
export class ModuleDetailPage {
  readonly id = input.required<string>();

  private readonly access = inject(AccessService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly icons = ICON_NAMES;
  protected readonly moduleId = computed(() => Number(this.id()));
  protected readonly module = signal<ModuleDto | null>(null);
  protected readonly items = signal<SubmoduleDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly form = signal<SubmoduleForm | null>(null);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);

  constructor() {
    effect(() => { const id = this.moduleId(); untracked(() => this.load(id)); });
  }

  private async load(id: number) {
    this.loading.set(true);
    try {
      this.module.set(await this.access.module(id));
      this.items.set(await this.access.submodules(id));
      this.error.set('');
    } catch (e) { this.error.set(ApiService.message(e)); }
    this.loading.set(false);
  }

  protected add() {
    this.formError.set('');
    this.form.set({ name: '', icon: 'table', route: '/', accessName: '', order: Math.max(0, ...this.items().map((s) => s.order)) + 10, isActive: true });
  }

  protected edit(s: SubmoduleDto) {
    this.formError.set('');
    this.form.set({ id: s.id, name: s.name, icon: s.icon || 'table', route: s.route, accessName: s.accessName, order: s.order, isActive: s.isActive });
  }

  protected async save() {
    const f = this.form();
    if (!f) return;
    this.busy.set(true);
    this.formError.set('');
    try {
      const { id, ...input } = f;
      if (id) await this.access.updateSubmodule(id, input); else await this.access.createSubmodule(this.moduleId(), input);
      this.toast.success('Sub-module saved.');
      this.form.set(null);
      await this.load(this.moduleId());
    } catch (e) {
      this.formError.set(ApiService.message(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(s: SubmoduleDto) {
    const ok = await this.confirm.ask(`“${s.name}” will be removed from this menu. Its permissions stay available and can be deleted separately.`,
      { title: 'Delete sub-module?', confirmText: 'Delete', danger: true });
    if (!ok) return;
    try { await this.access.deleteSubmodule(s.id); this.toast.success('Sub-module deleted.'); await this.load(this.moduleId()); }
    catch (e) { this.toast.error(ApiService.message(e)); }
  }
}
