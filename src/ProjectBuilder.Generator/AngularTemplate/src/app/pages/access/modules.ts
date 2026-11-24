import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccessService, ModuleDto, ModuleInput } from '../../core/access.service';
import { ApiService } from '../../core/api.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { ICON_NAMES, Icon } from '../../ui/icon';
import { T } from '../../ui/t.pipe';

interface ModuleForm extends ModuleInput { id?: number; }

/** System modules = the main menu. Each row can be opened (its sub-modules), given to roles (menu permission), edited or deleted. */
@Component({
  selector: 'app-modules',
  imports: [FormsModule, RouterLink, Icon, T],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="titles">
          <h1>{{ 'System modules' | t }}</h1>
          <span class="muted small">{{ 'The main menu. Open a module to manage its sub-modules (submenu) and their permissions.' | t }}</span>
        </div>
        <span class="spacer"></span>
        <button class="btn primary" (click)="add()"><app-icon name="plus" [size]="16" /> {{ 'Add module' | t }}</button>
      </div>

      @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() | t }}</div> }

      <div class="card table-card">
        <div class="table-scroll">
          <table class="data">
            <thead><tr><th>{{ 'Module' | t }}</th><th>{{ 'Slug' | t }}</th><th>{{ 'Sub-modules' | t }}</th><th>{{ 'Roles' | t }}</th><th>{{ 'Order' | t }}</th><th>{{ 'Status' | t }}</th><th></th></tr></thead>
            <tbody>
              @if (loading()) {
                @for (i of [1, 2, 3]; track i) { <tr><td colspan="7"><div class="skeleton" style="height:1.1rem"></div></td></tr> }
              }
              @for (m of items(); track m.id) {
                <tr>
                  <td>
                    <div class="row" style="flex-wrap:nowrap">
                      <span class="chip" style="display:inline-grid;place-items:center;width:34px;height:34px;padding:0"><app-icon [name]="m.icon || 'table'" /></span>
                      <div><a [routerLink]="['/admin/modules', m.id]" style="font-weight:600">{{ m.name | t }}</a>
                        @if (m.description) { <div class="muted small">{{ m.description }}</div> }</div>
                    </div>
                  </td>
                  <td class="muted">{{ m.slugname }}</td>
                  <td><span class="badge">{{ m.submoduleCount }}</span></td>
                  <td><span class="badge">{{ m.roleCount }}</span></td>
                  <td>{{ m.sortOrder }}</td>
                  <td><span class="badge" [class.ok]="m.isActive" [class.no]="!m.isActive">{{ (m.isActive ? 'Active' : 'Inactive') | t }}</span></td>
                  <td class="actions">
                    <div class="actions-wrap">
                      <a class="btn sm" [routerLink]="['/admin/modules', m.id]"><app-icon name="eye" [size]="14" /> {{ 'View details' | t }}</a>
                      <a class="btn sm" [routerLink]="['/admin/modules', m.id, 'menu-permission']"><app-icon name="list" [size]="14" /> {{ 'Menu permission' | t }}</a>
                      <button class="btn icon ghost" (click)="edit(m)" [attr.aria-label]="'Edit module' | t" [title]="'Edit' | t"><app-icon name="edit" [size]="16" /></button>
                      <button class="btn icon ghost danger" (click)="remove(m)" [attr.aria-label]="'Delete module' | t" [title]="'Delete' | t"><app-icon name="trash" [size]="16" /></button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (!loading() && items().length === 0) {
          <div class="empty"><div class="ico"><app-icon name="layout" [size]="26" /></div><h3>{{ 'No modules yet' | t }}</h3><p>{{ 'Add the first menu entry.' | t }}</p></div>
        }
      </div>
    </div>

    @if (form(); as f) {
      <div class="backdrop" (click)="form.set(null)">
        <form class="dialog wide" (ngSubmit)="save()" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" [attr.aria-label]="'Module' | t">
          <h2>{{ (f.id ? 'Edit module' : 'Add module') | t }}</h2>
          @if (formError()) { <div class="alert error" role="alert" style="margin-top:.75rem"><app-icon name="alert" />{{ formError() | t }}</div> }
          <div class="form-grid" style="margin-top:1rem">
            <div><label class="lbl" for="m-name">{{ 'Name' | t }} <span class="req">*</span></label>
              <input id="m-name" name="name" type="text" [(ngModel)]="f.name" required maxlength="100" (input)="autoSlug(f)" /></div>
            <div><label class="lbl" for="m-slug">{{ 'Slug' | t }} <span class="req">*</span></label>
              <input id="m-slug" name="slug" type="text" [(ngModel)]="f.slugname" required maxlength="100" pattern="[a-z0-9\\-]+" /></div>
            <div><label class="lbl" for="m-icon">{{ 'Icon' | t }}</label>
              <select id="m-icon" name="icon" [(ngModel)]="f.icon">@for (n of icons; track n) { <option [value]="n">{{ n }}</option> }</select></div>
            <div><label class="lbl" for="m-access">{{ 'Access name' | t }}</label>
              <input id="m-access" name="access" type="text" [(ngModel)]="f.accessName" maxlength="100" /></div>
            <div><label class="lbl" for="m-order">{{ 'Order' | t }}</label>
              <input id="m-order" name="order" type="number" [(ngModel)]="f.sortOrder" /></div>
            <div><label class="lbl">{{ 'Status' | t }}</label>
              <label class="row" style="gap:.6rem;padding:.4rem 0"><input type="checkbox" name="active" [(ngModel)]="f.isActive" /> <span class="muted">{{ 'Active' | t }}</span></label></div>
            <div class="full"><label class="lbl" for="m-desc">{{ 'Description' | t }}</label>
              <textarea id="m-desc" name="desc" rows="2" [(ngModel)]="f.description" maxlength="500"></textarea></div>
          </div>
          <div class="row" style="justify-content:flex-end;margin-top:1.25rem">
            <button class="btn" type="button" (click)="form.set(null)">{{ 'Cancel' | t }}</button>
            <button class="btn primary" type="submit" [disabled]="busy()">{{ (busy() ? 'Saving…' : 'Save') | t }}</button>
          </div>
        </form>
      </div>
    }
  `
})
export class ModulesPage {
  private readonly access = inject(AccessService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly icons = ICON_NAMES;
  protected readonly items = signal<ModuleDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly form = signal<ModuleForm | null>(null);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);

  constructor() { this.load(); }

  private async load() {
    try { this.items.set(await this.access.modules()); this.error.set(''); }
    catch (e) { this.error.set(ApiService.message(e)); }
    this.loading.set(false);
  }

  protected add() {
    this.formError.set('');
    this.form.set({ name: '', slugname: '', icon: 'table', description: '', accessName: '', sortOrder: Math.max(0, ...this.items().map((m) => m.sortOrder)) + 10, isActive: true });
  }

  protected edit(m: ModuleDto) {
    this.formError.set('');
    this.form.set({ id: m.id, name: m.name, slugname: m.slugname, icon: m.icon || 'table', description: m.description ?? '', accessName: m.accessName ?? '', sortOrder: m.sortOrder, isActive: m.isActive });
  }

  /** While adding, the slug follows the name until it is edited by hand. */
  protected autoSlug(f: ModuleForm) {
    if (f.id) return;
    f.slugname = f.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    f.accessName = f.slugname;
  }

  protected async save() {
    const f = this.form();
    if (!f) return;
    this.busy.set(true);
    this.formError.set('');
    try {
      const { id, ...input } = f;
      if (id) await this.access.updateModule(id, input); else await this.access.createModule(input);
      this.toast.success('Module saved.');
      this.form.set(null);
      await this.load();
    } catch (e) {
      this.formError.set(ApiService.message(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(m: ModuleDto) {
    const ok = await this.confirm.ask('“{0}”, its {1} sub-module(s) and their menu assignments will be deleted.',
      { params: [m.name, m.submoduleCount], title: 'Delete module?', confirmText: 'Delete', danger: true });
    if (!ok) return;
    try { await this.access.deleteModule(m.id); this.toast.success('Module deleted.'); await this.load(); }
    catch (e) { this.toast.error(ApiService.message(e)); }
  }
}
