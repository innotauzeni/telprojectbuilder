import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccessService, ModuleDto, RoleDto } from '../../core/access.service';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../ui/icon';
import { T } from '../../ui/t.pipe';

/** "Menu permission": choose which roles can see a menu (system module). */
@Component({
  selector: 'app-module-roles',
  imports: [RouterLink, Icon, T],
  template: `
    <div class="page" style="max-width:760px">
      <div class="page-header">
        <div class="titles">
          <span class="crumbs"><a routerLink="/admin/modules">{{ 'System modules' | t }}</a> /
            <a [routerLink]="['/admin/modules', moduleId()]">{{ module()?.name | t }}</a> / {{ 'Menu permission' | t }}</span>
          <h1>{{ 'Who can see “{0}”?' | t: [(module()?.name | t)] }}</h1>
          <span class="muted small">{{ 'Roles ticked here get this menu and all its sub-modules (a sub-module still needs its View permission).' | t }}</span>
        </div>
      </div>

      @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() | t }}</div> }

      <div class="card table-card">
        <table class="data">
          <thead><tr><th style="width:60px">{{ 'Can see' | t }}</th><th>{{ 'Role' | t }}</th><th>{{ 'Type' | t }}</th><th>{{ 'Level' | t }}</th></tr></thead>
          <tbody>
            @if (loading()) { @for (i of [1, 2, 3]; track i) { <tr><td colspan="4"><div class="skeleton" style="height:1.1rem"></div></td></tr> } }
            @for (r of roles(); track r.id) {
              <tr>
                <td><input type="checkbox" [checked]="r.name === 'Admin' || picked().has(r.id)" [disabled]="r.name === 'Admin'"
                           (change)="toggle(r.id)" [attr.aria-label]="'Menu for {0}' | t: [r.name]" /></td>
                <td style="font-weight:600">{{ r.name }} @if (r.name === 'Admin') { <span class="badge primary">{{ 'always' | t }}</span> }</td>
                <td class="muted">{{ r.type || '—' }}</td>
                <td class="muted">{{ r.level || '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="sticky-bar">
        <a class="btn" [routerLink]="['/admin/modules']">{{ 'Back' | t }}</a>
        <button class="btn primary" (click)="save()" [disabled]="busy() || loading()"><app-icon name="check" [size]="16" /> {{ (busy() ? 'Saving…' : 'Save') | t }}</button>
      </div>
    </div>
  `
})
export class ModuleRolesPage {
  readonly id = input.required<string>();

  private readonly access = inject(AccessService);
  private readonly toast = inject(ToastService);

  protected readonly moduleId = computed(() => Number(this.id()));
  protected readonly module = signal<ModuleDto | null>(null);
  protected readonly roles = signal<RoleDto[]>([]);
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  constructor() {
    effect(() => { const id = this.moduleId(); untracked(() => this.load(id)); });
  }

  private async load(id: number) {
    this.loading.set(true);
    try {
      this.module.set(await this.access.module(id));
      this.roles.set(await this.access.roles());
      this.picked.set(new Set(await this.access.moduleRoles(id)));
      this.error.set('');
    } catch (e) { this.error.set(ApiService.message(e)); }
    this.loading.set(false);
  }

  protected toggle(roleId: string) {
    const next = new Set(this.picked());
    if (next.has(roleId)) next.delete(roleId); else next.add(roleId);
    this.picked.set(next);
  }

  protected async save() {
    this.busy.set(true);
    try {
      await this.access.setModuleRoles(this.moduleId(), [...this.picked()]);
      this.toast.success('Menu permission saved.');
    } catch (e) {
      this.toast.error(ApiService.message(e));
    } finally {
      this.busy.set(false);
    }
  }
}
