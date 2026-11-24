import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccessService, PermissionDto, RoleDto, SubmoduleDto } from '../../core/access.service';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../ui/icon';

/** "Role permission" for one sub-module: a grid of roles and this sub-module's permissions. */
@Component({
  selector: 'app-submodule-roles',
  imports: [RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="titles">
          <span class="crumbs"><a routerLink="/admin/modules">System modules</a> /
            <a [routerLink]="['/admin/modules', sub()?.moduleId]">Module</a> /
            <a [routerLink]="['/admin/submodules', subId()]">{{ sub()?.name }}</a> / Role permission</span>
          <h1>Role permission: {{ sub()?.name }}</h1>
          <span class="muted small">Tick what each role may do. Admin can always do everything.</span>
        </div>
      </div>

      @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() }}</div> }

      @if (!loading() && permissions().length === 0) {
        <div class="card empty"><div class="ico"><app-icon name="key" [size]="26" /></div><h3>No permissions on this sub-module</h3>
          <p>Add some first, then come back to give them to roles.</p>
          <a class="btn primary" [routerLink]="['/admin/submodules', subId()]">Add permissions</a></div>
      } @else {
        <div class="card table-card">
          <div class="table-scroll">
            <table class="data matrix">
              <thead>
                <tr>
                  <th>Role</th>
                  @for (p of permissions(); track p.id) { <th [title]="p.name">{{ p.displayName }}</th> }
                  <th>All</th>
                </tr>
              </thead>
              <tbody>
                @if (loading()) { <tr><td [attr.colspan]="permissions().length + 2"><div class="skeleton" style="height:1.1rem"></div></td></tr> }
                @for (r of roles(); track r.id) {
                  <tr>
                    <td style="font-weight:600">{{ r.name }} @if (r.name === 'Admin') { <span class="badge primary">always</span> }</td>
                    @for (p of permissions(); track p.id) {
                      <td><input type="checkbox" [checked]="r.name === 'Admin' || has(r.id, p.id)" [disabled]="r.name === 'Admin'"
                                 (change)="toggle(r.id, p.id)" [attr.aria-label]="r.name + ': ' + p.displayName" /></td>
                    }
                    <td><input type="checkbox" [checked]="r.name === 'Admin' || all(r.id)" [disabled]="r.name === 'Admin'"
                               (change)="toggleAll(r.id)" [attr.aria-label]="r.name + ': all'" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
        <div class="sticky-bar">
          <a class="btn" [routerLink]="['/admin/modules', sub()?.moduleId]">Back</a>
          <button class="btn primary" (click)="save()" [disabled]="busy() || loading()"><app-icon name="check" [size]="16" /> {{ busy() ? 'Saving…' : 'Save' }}</button>
        </div>
      }
    </div>
  `
})
export class SubmoduleRolesPage {
  readonly id = input.required<string>();

  private readonly access = inject(AccessService);
  private readonly toast = inject(ToastService);

  protected readonly subId = computed(() => Number(this.id()));
  protected readonly sub = signal<SubmoduleDto | null>(null);
  protected readonly permissions = signal<PermissionDto[]>([]);
  protected readonly roles = signal<RoleDto[]>([]);
  /** roleId -> permission ids the role holds (all permissions, not just this sub-module's). */
  protected readonly grants = signal<Record<string, ReadonlySet<number>>>({});
  private original: Record<string, string> = {};
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  constructor() {
    effect(() => { const id = this.subId(); untracked(() => this.load(id)); });
  }

  private async load(id: number) {
    this.loading.set(true);
    try {
      this.sub.set(await this.access.submodule(id));
      this.permissions.set(await this.access.permissions(id));
      const roles = await this.access.roles();
      this.roles.set(roles);
      const g: Record<string, ReadonlySet<number>> = {};
      for (const r of roles) g[r.id] = new Set(r.permissionIds);
      this.grants.set(g);
      this.original = Object.fromEntries(roles.map((r) => [r.id, this.key(g[r.id])]));
      this.error.set('');
    } catch (e) { this.error.set(ApiService.message(e)); }
    this.loading.set(false);
  }

  private key(s: ReadonlySet<number>) { return [...s].sort((a, b) => a - b).join(','); }

  protected has(roleId: string, permissionId: number) { return this.grants()[roleId]?.has(permissionId) ?? false; }
  protected all(roleId: string) { const p = this.permissions(); return p.length > 0 && p.every((x) => this.has(roleId, x.id)); }

  protected toggle(roleId: string, permissionId: number) {
    const next = new Set(this.grants()[roleId] ?? []);
    if (next.has(permissionId)) next.delete(permissionId); else next.add(permissionId);
    this.grants.update((g) => ({ ...g, [roleId]: next }));
  }

  protected toggleAll(roleId: string) {
    const next = new Set(this.grants()[roleId] ?? []);
    const everyone = this.all(roleId);
    for (const p of this.permissions()) { if (everyone) next.delete(p.id); else next.add(p.id); }
    this.grants.update((g) => ({ ...g, [roleId]: next }));
  }

  /** Saves every role whose permissions changed (each role is replaced with its full new list). */
  protected async save() {
    this.busy.set(true);
    try {
      let changed = 0;
      for (const r of this.roles()) {
        if (r.name === 'Admin') continue;
        const now = this.grants()[r.id] ?? new Set<number>();
        if (this.key(now) === this.original[r.id]) continue;
        await this.access.setRolePermissions(r.id, [...now]);
        this.original[r.id] = this.key(now);
        changed++;
      }
      this.toast.success(changed ? `Saved ${changed} role(s).` : 'Nothing to save.');
    } catch (e) {
      this.toast.error(ApiService.message(e));
    } finally {
      this.busy.set(false);
    }
  }
}
