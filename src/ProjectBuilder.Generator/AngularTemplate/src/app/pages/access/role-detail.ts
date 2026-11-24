import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccessService, AccessTree, RoleDto } from '../../core/access.service';
import { ApiService } from '../../core/api.service';
import { Icon } from '../../ui/icon';

interface Group { module: string; items: { name: string; displayName: string }[]; }

/** Read-only summary of a role: its menus and permissions. */
@Component({
  selector: 'app-role-detail',
  imports: [RouterLink, Icon],
  template: `
    <div class="page" style="max-width:960px">
      <div class="page-header">
        <div class="titles">
          <span class="crumbs"><a routerLink="/admin/roles">Roles</a> / {{ role()?.name }}</span>
          <h1>{{ role()?.name }} @if (role()?.builtIn) { <span class="badge primary" style="vertical-align:middle">built-in</span> }</h1>
        </div>
        <span class="spacer"></span>
        @if (role(); as r) {
          <a class="btn" [routerLink]="['/admin/roles', r.id, 'assign']" [queryParams]="{ focus: 'menus' }"><app-icon name="list" [size]="16" /> Menu permission</a>
          <a class="btn primary" [routerLink]="['/admin/roles', r.id, 'assign']" [queryParams]="{ focus: 'permissions' }"><app-icon name="key" [size]="16" /> Role permission</a>
        }
      </div>

      @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() }}</div> }

      @if (role(); as r) {
        <div class="card" style="margin-bottom:1rem">
          <div class="row" style="gap:2rem">
            <div><div class="muted small">Type</div><div>{{ r.type || '—' }}</div></div>
            <div><div class="muted small">Level</div><div>{{ r.level || '—' }}</div></div>
            <div><div class="muted small">Users with this role</div><div>{{ r.userCount }}</div></div>
          </div>
        </div>

        @if (r.name === 'Admin') {
          <div class="alert info"><app-icon name="shield" /> Admin always sees every menu and can do everything, so nothing is assigned to it.</div>
        } @else {
          <div class="grid" style="grid-template-columns: 1fr 2fr; align-items:start">
            <div class="card">
              <h2 style="margin-bottom:.75rem">Menus <span class="badge">{{ menus().length }}</span></h2>
              @for (m of menus(); track m) { <div class="row" style="padding:.25rem 0"><app-icon name="check" [size]="14" /> {{ m }}</div> }
              @empty { <span class="muted small">No menus yet.</span> }
            </div>
            <div class="card">
              <h2 style="margin-bottom:.75rem">Permissions <span class="badge">{{ r.permissionIds.length }}</span></h2>
              @for (g of groups(); track g.module) {
                <div style="margin-bottom:.9rem">
                  <div class="muted small" style="font-weight:650; margin-bottom:.3rem">{{ g.module }}</div>
                  <div class="row">@for (p of g.items; track p.name) { <span class="chip" [title]="p.name">{{ p.displayName }}</span> }</div>
                </div>
              }
              @empty { <span class="muted small">No permissions yet.</span> }
            </div>
          </div>
        }
      }
    </div>
  `
})
export class RoleDetailPage {
  readonly id = input.required<string>();

  private readonly access = inject(AccessService);

  protected readonly role = signal<RoleDto | null>(null);
  protected readonly tree = signal<AccessTree | null>(null);
  protected readonly error = signal('');

  protected readonly menus = computed(() => {
    const r = this.role(), t = this.tree();
    return r && t ? t.modules.filter((m) => r.menuIds.includes(m.id)).map((m) => m.name) : [];
  });

  /** The role's permissions grouped by the sub-module they belong to. */
  protected readonly groups = computed<Group[]>(() => {
    const r = this.role(), t = this.tree();
    if (!r || !t) return [];
    const held = new Set(r.permissionIds);
    const out: Group[] = [];
    for (const m of t.modules)
      for (const s of m.submodules) {
        const items = s.permissions.filter((p) => held.has(p.id));
        if (items.length) out.push({ module: `${m.name} › ${s.name}`, items });
      }
    const other = t.other.filter((p) => held.has(p.id));
    if (other.length) out.push({ module: 'Other', items: other });
    return out;
  });

  constructor() {
    effect(() => { const id = this.id(); untracked(() => this.load(id)); });
  }

  private async load(id: string) {
    try {
      this.role.set(await this.access.role(id));
      this.tree.set(await this.access.tree());
      this.error.set('');
    } catch (e) { this.error.set(ApiService.message(e)); }
  }
}
