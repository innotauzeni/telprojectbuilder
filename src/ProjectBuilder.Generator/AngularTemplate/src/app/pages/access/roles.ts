import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccessService, RoleDto, RoleInput } from '../../core/access.service';
import { ApiService } from '../../core/api.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../ui/icon';
import { T } from '../../ui/t.pipe';

interface RoleForm extends RoleInput { id?: string; builtIn?: boolean; }

/** Roles. Each row can be opened (view details), given menus (menu permission) or permissions (role permission). */
@Component({
  selector: 'app-roles',
  imports: [FormsModule, RouterLink, Icon, T],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="titles">
          <h1>{{ 'Roles' | t }}</h1>
          <span class="muted small">{{ 'A role decides which menus people see and what they may do. Give a role to a user when you register them.' | t }}</span>
        </div>
        <span class="spacer"></span>
        <button class="btn primary" (click)="add()"><app-icon name="plus" [size]="16" /> {{ 'Add role' | t }}</button>
      </div>

      @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() | t }}</div> }

      <div class="card table-card">
        <div class="table-scroll">
          <table class="data">
            <thead><tr><th>{{ 'Role' | t }}</th><th>{{ 'Type' | t }}</th><th>{{ 'Level' | t }}</th><th>{{ 'Users' | t }}</th><th>{{ 'Menus' | t }}</th><th>{{ 'Permissions' | t }}</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { @for (i of [1, 2, 3]; track i) { <tr><td colspan="7"><div class="skeleton" style="height:1.1rem"></div></td></tr> } }
              @for (r of items(); track r.id) {
                <tr>
                  <td><a [routerLink]="['/admin/roles', r.id]" style="font-weight:600">{{ r.name }}</a>
                    @if (r.builtIn) { <span class="badge primary" style="margin-left:.4rem">{{ 'built-in' | t }}</span> }</td>
                  <td class="muted">{{ r.type || '—' }}</td>
                  <td class="muted">{{ r.level || '—' }}</td>
                  <td><span class="badge">{{ r.userCount }}</span></td>
                  <td>@if (r.name === 'Admin') { <span class="badge ok">{{ 'all' | t }}</span> } @else { <span class="badge">{{ r.menuIds.length }}</span> }</td>
                  <td>@if (r.name === 'Admin') { <span class="badge ok">{{ 'all' | t }}</span> } @else { <span class="badge">{{ r.permissionIds.length }}</span> }</td>
                  <td class="actions"><div class="actions-wrap">
                    <a class="btn sm" [routerLink]="['/admin/roles', r.id]"><app-icon name="eye" [size]="14" /> {{ 'View details' | t }}</a>
                    <a class="btn sm" [routerLink]="['/admin/roles', r.id, 'assign']" [queryParams]="{ focus: 'menus' }"><app-icon name="list" [size]="14" /> {{ 'Menu permission' | t }}</a>
                    <a class="btn sm" [routerLink]="['/admin/roles', r.id, 'assign']" [queryParams]="{ focus: 'permissions' }"><app-icon name="key" [size]="14" /> {{ 'Role permission' | t }}</a>
                    <button class="btn icon ghost" (click)="edit(r)" [attr.aria-label]="'Edit role' | t" [title]="'Edit' | t"><app-icon name="edit" [size]="16" /></button>
                    @if (!r.builtIn) {
                      <button class="btn icon ghost danger" (click)="remove(r)" [attr.aria-label]="'Delete role' | t" [title]="'Delete' | t"><app-icon name="trash" [size]="16" /></button>
                    }
                  </div></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>

    @if (form(); as f) {
      <div class="backdrop" (click)="form.set(null)">
        <form class="dialog wide" (ngSubmit)="save()" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" [attr.aria-label]="'Role' | t">
          <h2>{{ (f.id ? 'Edit role' : 'Add role') | t }}</h2>
          @if (formError()) { <div class="alert error" role="alert" style="margin-top:.75rem"><app-icon name="alert" />{{ formError() | t }}</div> }
          <div class="form-grid" style="margin-top:1rem">
            <div class="full"><label class="lbl" for="r-name">{{ 'Name' | t }} <span class="req">*</span></label>
              <input id="r-name" name="name" type="text" [(ngModel)]="f.name" required maxlength="50" [disabled]="!!f.builtIn" />
              @if (f.builtIn) { <div class="hint">{{ 'Built-in roles cannot be renamed.' | t }}</div> }</div>
            <div><label class="lbl" for="r-type">{{ 'Type' | t }}</label><input id="r-type" name="type" type="text" [(ngModel)]="f.type" maxlength="50" [placeholder]="'e.g. Staff' | t" /></div>
            <div><label class="lbl" for="r-level">{{ 'Level' | t }}</label><input id="r-level" name="level" type="text" [(ngModel)]="f.level" maxlength="50" [placeholder]="'e.g. Senior' | t" /></div>
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
export class RolesPage {
  private readonly access = inject(AccessService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly items = signal<RoleDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly form = signal<RoleForm | null>(null);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);

  constructor() { this.load(); }

  private async load() {
    try { this.items.set(await this.access.roles()); this.error.set(''); }
    catch (e) { this.error.set(ApiService.message(e)); }
    this.loading.set(false);
  }

  protected add() { this.formError.set(''); this.form.set({ name: '', type: '', level: '' }); }
  protected edit(r: RoleDto) {
    this.formError.set('');
    this.form.set({ id: r.id, name: r.name, type: r.type ?? '', level: r.level ?? '', builtIn: r.builtIn });
  }

  protected async save() {
    const f = this.form();
    if (!f) return;
    this.busy.set(true);
    this.formError.set('');
    try {
      const input: RoleInput = { name: f.name, type: f.type, level: f.level };
      if (f.id) await this.access.updateRole(f.id, input); else await this.access.createRole(input);
      this.toast.success('Role saved.');
      this.form.set(null);
      await this.load();
    } catch (e) {
      this.formError.set(ApiService.message(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(r: RoleDto) {
    const ok = await this.confirm.ask('The role “{0}” and its menu and permission assignments will be deleted.',
      { params: [r.name], title: 'Delete role?', confirmText: 'Delete', danger: true });
    if (!ok) return;
    try { await this.access.deleteRole(r.id); this.toast.success('Role deleted.'); await this.load(); }
    catch (e) { this.toast.error(ApiService.message(e)); }
  }
}
