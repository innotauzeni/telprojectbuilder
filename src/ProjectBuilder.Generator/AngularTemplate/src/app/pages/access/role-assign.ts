import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccessService, AccessTree, RoleDto, TreePermission } from '../../core/access.service';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../ui/icon';
import { T } from '../../ui/t.pipe';

/** Assign menus and permissions to one role, on one page. Both are saved together. */
@Component({
  selector: 'app-role-assign',
  imports: [RouterLink, Icon, T],
  template: `
    <div class="page" style="max-width:1000px">
      <div class="page-header">
        <div class="titles">
          <span class="crumbs"><a routerLink="/admin/roles">{{ 'Roles' | t }}</a> / <a [routerLink]="['/admin/roles', id()]">{{ role()?.name }}</a> / {{ 'Assign' | t }}</span>
          <h1>{{ 'Assign access to “{0}”' | t: [(role()?.name)] }}</h1>
          <span class="muted small">{{ 'Menus decide what shows in the sidebar. Permissions decide what the role may do on each screen.' | t }}</span>
        </div>
      </div>

      @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() | t }}</div> }

      @if (role()?.name === 'Admin') {
        <div class="alert info"><app-icon name="shield" /> {{ 'Admin always sees every menu and can do everything, so there is nothing to assign.' | t }}</div>
      } @else if (tree(); as t) {
        <!-- menus -->
        <div class="card" id="menus" [style.border-color]="focus() === 'menus' ? 'var(--primary)' : ''" style="margin-bottom:1rem">
          <div class="row" style="margin-bottom:.75rem">
            <h2>{{ 'Menus' | t }} <span class="badge">{{ '{0} of {1}' | t: [(menuIds().size), (t.modules.length)] }}</span></h2>
            <span class="spacer"></span>
            <button class="btn sm" (click)="allMenus(true)">{{ 'Select all' | t }}</button>
            <button class="btn sm" (click)="allMenus(false)">{{ 'Clear' | t }}</button>
          </div>
          <div class="checks">
            @for (m of t.modules; track m.id) {
              <label class="check" [class.on]="menuIds().has(m.id)">
                <input type="checkbox" [checked]="menuIds().has(m.id)" (change)="toggleMenu(m.id)" />
                <app-icon [name]="m.icon || 'table'" [size]="15" /> {{ m.name | t }}
              </label>
            }
          </div>
        </div>

        <!-- permissions -->
        <div class="card table-card" id="permissions" [style.border-color]="focus() === 'permissions' ? 'var(--primary)' : ''">
          <div class="row" style="padding:1rem 1.25rem">
            <h2>{{ 'Permissions' | t }} <span class="badge">{{ '{0} selected' | t: [(permIds().size)] }}</span></h2>
            <span class="spacer"></span>
            <div style="position:relative; width:230px">
              <span style="position:absolute; left:.7rem; top:50%; transform:translateY(-50%); color:var(--muted)"><app-icon name="search" [size]="16" /></span>
              <input type="text" [placeholder]="'Filter permissions…' | t" [attr.aria-label]="'Filter permissions' | t" style="padding-left:2.1rem" (input)="filter.set($any($event.target).value)" />
            </div>
            <button class="btn sm" (click)="allPerms(true)">{{ 'Select all' | t }}</button>
            <button class="btn sm" (click)="allPerms(false)">{{ 'Clear' | t }}</button>
          </div>

          @for (m of visible(); track m.id) {
            <div class="group-title">
              <app-icon [name]="m.icon || 'table'" [size]="16" /> {{ m.name | t }}
              <span class="spacer"></span>
              <label class="row small" style="gap:.4rem;font-weight:500"><input type="checkbox" [checked]="moduleAll(m.id)" (change)="toggleGroup(modulePerms(m.id))" /> {{ 'all' | t }}</label>
            </div>
            @for (s of m.submodules; track s.id) {
              <div class="row" style="padding:.7rem 1.25rem; border-bottom:1px solid var(--border); align-items:flex-start">
                <div style="width:200px">
                  <div style="font-weight:600">{{ s.name | t }}</div>
                  <label class="row small muted" style="gap:.4rem;font-weight:500"><input type="checkbox" [checked]="groupAll(s.permissions)" (change)="toggleGroup(s.permissions)" /> {{ 'all' | t }}</label>
                </div>
                <div class="checks" style="flex:1">
                  @for (p of s.permissions; track p.id) {
                    <label class="check" [class.on]="permIds().has(p.id)" [title]="p.name">
                      <input type="checkbox" [checked]="permIds().has(p.id)" (change)="togglePerm(p.id)" /> {{ p.displayName | t }}
                    </label>
                  } @empty { <span class="muted small">{{ 'No permissions yet. Add some on the sub-module page.' | t }}</span> }
                </div>
              </div>
            }
          }

          @if (otherVisible().length) {
            <div class="group-title"><app-icon name="key" [size]="16" /> {{ 'Other permissions' | t }}</div>
            <div class="checks" style="padding:.8rem 1.25rem">
              @for (p of otherVisible(); track p.id) {
                <label class="check" [class.on]="permIds().has(p.id)" [title]="p.name">
                  <input type="checkbox" [checked]="permIds().has(p.id)" (change)="togglePerm(p.id)" /> {{ p.displayName | t }}
                </label>
              }
            </div>
          }
        </div>

        <div class="sticky-bar">
          <a class="btn" routerLink="/admin/roles">{{ 'Back' | t }}</a>
          <button class="btn primary" (click)="save()" [disabled]="busy()"><app-icon name="check" [size]="16" /> {{ (busy() ? 'Saving…' : 'Save menus and permissions') | t }}</button>
        </div>
      } @else {
        <div class="card"><div class="skeleton" style="height:1.2rem;width:30%;margin-bottom:1rem"></div><div class="skeleton" style="height:8rem"></div></div>
      }
    </div>
  `
})
export class RoleAssignPage {
  readonly id = input.required<string>();
  /** 'menus' or 'permissions': which section the person came for (it is highlighted and scrolled into view). */
  readonly focus = input<string>();

  private readonly access = inject(AccessService);
  private readonly toast = inject(ToastService);

  protected readonly role = signal<RoleDto | null>(null);
  protected readonly tree = signal<AccessTree | null>(null);
  protected readonly menuIds = signal<ReadonlySet<number>>(new Set());
  protected readonly permIds = signal<ReadonlySet<number>>(new Set());
  protected readonly filter = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  /** Modules and sub-modules narrowed by the filter box (matches names and permission names). */
  protected readonly visible = computed(() => {
    const t = this.tree(); const q = this.filter().trim().toLowerCase();
    if (!t) return [];
    if (!q) return t.modules;
    const hit = (p: TreePermission) => (p.name + ' ' + p.displayName).toLowerCase().includes(q);
    return t.modules
      .map((m) => ({ ...m, submodules: m.submodules.map((s) => ({ ...s, permissions: s.name.toLowerCase().includes(q) ? s.permissions : s.permissions.filter(hit) }))
        .filter((s) => s.permissions.length > 0 || s.name.toLowerCase().includes(q)) }))
      .filter((m) => m.submodules.length > 0);
  });
  protected readonly otherVisible = computed(() => {
    const t = this.tree(); const q = this.filter().trim().toLowerCase();
    return !t ? [] : q ? t.other.filter((p) => (p.name + ' ' + p.displayName).toLowerCase().includes(q)) : t.other;
  });

  constructor() {
    effect(() => { const id = this.id(); untracked(() => this.load(id)); });
  }

  private async load(id: string) {
    try {
      const role = await this.access.role(id);
      this.role.set(role);
      this.menuIds.set(new Set(role.menuIds));
      this.permIds.set(new Set(role.permissionIds));
      this.tree.set(await this.access.tree());
      this.error.set('');
      const target = this.focus();
      if (target) setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) { this.error.set(ApiService.message(e)); }
  }

  protected toggleMenu(id: number) { this.menuIds.set(flip(this.menuIds(), id)); }
  protected allMenus(on: boolean) { this.menuIds.set(on ? new Set(this.tree()!.modules.map((m) => m.id)) : new Set()); }

  protected togglePerm(id: number) { this.permIds.set(flip(this.permIds(), id)); }
  protected allPerms(on: boolean) {
    const t = this.tree()!;
    this.permIds.set(on ? new Set([...t.modules.flatMap((m) => m.submodules.flatMap((s) => s.permissions)), ...t.other].map((p) => p.id)) : new Set());
  }

  protected groupAll(list: TreePermission[]) { return list.length > 0 && list.every((p) => this.permIds().has(p.id)); }
  protected toggleGroup(list: TreePermission[]) {
    const next = new Set(this.permIds());
    const on = !this.groupAll(list);
    for (const p of list) { if (on) next.add(p.id); else next.delete(p.id); }
    this.permIds.set(next);
  }
  protected modulePerms(moduleId: number): TreePermission[] {
    return this.tree()?.modules.find((m) => m.id === moduleId)?.submodules.flatMap((s) => s.permissions) ?? [];
  }
  protected moduleAll(moduleId: number) { return this.groupAll(this.modulePerms(moduleId)); }

  protected async save() {
    this.busy.set(true);
    try {
      await this.access.setRoleMenus(this.id(), [...this.menuIds()]);
      await this.access.setRolePermissions(this.id(), [...this.permIds()]);
      this.toast.success('Menus and permissions saved.');
    } catch (e) {
      this.toast.error(ApiService.message(e));
    } finally {
      this.busy.set(false);
    }
  }
}

function flip(set: ReadonlySet<number>, id: number): ReadonlySet<number> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}
