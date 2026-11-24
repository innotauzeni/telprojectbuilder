import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { ConfigService } from '../core/config.service';
import { ConfirmService } from '../core/confirm.service';
import { MenuService } from '../core/menu.service';
import { MetaService } from '../core/meta.service';
import { ToastService } from '../core/toast.service';
import { ICON_NAMES, Icon } from '../ui/icon';
import { T } from '../ui/t.pipe';

interface MenuItem { id?: string; label: string; route: string; icon: string | null; sortOrder: number; roles: string | null; isVisible: boolean; }

/** Admin screen for the dynamic menu: add, reorder, hide or remove navigation entries without redeploying. */
@Component({
  selector: 'app-menu-admin',
  imports: [FormsModule, Icon, T],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="titles">
          <h1>{{ 'Menu' | t }}</h1>
          <span class="muted small">{{ 'Control what appears in the sidebar and who can see it. Changes apply on the next page load.' | t }}</span>
        </div>
        <span class="spacer"></span>
        <button class="btn primary" (click)="add()"><app-icon name="plus" [size]="16" /> {{ 'Add entry' | t }}</button>
      </div>

      @if (!meta.dynamicMenu()) {
        <div class="alert info"><app-icon name="alert" /> {{ 'This system was generated without a dynamic menu, so these entries are not used.' | t }}</div>
      }
      @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() | t }}</div> }

      <div class="card table-card">
        <div class="table-scroll">
          <table class="data">
            <thead><tr><th style="width:56px"></th><th>{{ 'Label' | t }}</th><th>{{ 'Route' | t }}</th><th>{{ 'Icon' | t }}</th><th style="width:90px">{{ 'Order' | t }}</th><th>{{ 'Visible to' | t }}</th><th style="width:80px">{{ 'Shown' | t }}</th><th></th></tr></thead>
            <tbody>
              @for (m of items(); track $index) {
                <tr>
                  <td><span class="chip" style="display:inline-grid;place-items:center;width:34px;height:34px;padding:0"><app-icon [name]="m.icon || 'table'" /></span></td>
                  <td><input type="text" [(ngModel)]="m.label" [name]="'l' + $index" maxlength="100" [attr.aria-label]="'Label' | t" /></td>
                  <td>
                    <input type="text" [(ngModel)]="m.route" [name]="'r' + $index" list="routes" maxlength="200" [attr.aria-label]="'Route' | t" placeholder="/e/students" />
                  </td>
                  <td>
                    <select [(ngModel)]="m.icon" [name]="'i' + $index" [attr.aria-label]="'Icon' | t">
                      <option [ngValue]="null">table</option>
                      @for (n of icons; track n) { <option [ngValue]="n">{{ n }}</option> }
                    </select>
                  </td>
                  <td><input type="number" [(ngModel)]="m.sortOrder" [name]="'o' + $index" [attr.aria-label]="'Order' | t" /></td>
                  <td>
                    <input type="text" [(ngModel)]="m.roles" [name]="'ro' + $index" [placeholder]="'everyone' | t" [attr.aria-label]="'Roles' | t" />
                    <div class="hint">{{ 'e.g. Admin, User' | t }}</div>
                  </td>
                  <td><input type="checkbox" [(ngModel)]="m.isVisible" [name]="'v' + $index" [attr.aria-label]="'Shown' | t" /></td>
                  <td class="actions">
                    <button class="btn primary" (click)="save(m)" [disabled]="busy()">{{ 'Save' | t }}</button>
                    <button class="btn icon ghost danger" (click)="remove(m, $index)" [attr.aria-label]="'Delete entry' | t"><app-icon name="trash" [size]="16" /></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (loaded() && items().length === 0) {
          <div class="empty"><h3>{{ 'No menu entries' | t }}</h3><p>{{ 'Add the first one.' | t }}</p></div>
        }
      </div>
      <datalist id="routes">@for (r of routes(); track r) { <option [value]="r"></option> }</datalist>
    </div>
  `
})
export class MenuAdminPage {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly menuService = inject(MenuService);
  protected readonly meta = inject(MetaService);

  protected readonly icons = ICON_NAMES;
  protected readonly items = signal<MenuItem[]>([]);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly routes = computed(() => ['/', ...this.meta.entities().map((e) => '/e/' + e.route), '/admin/menu']);

  private get url() { return `${this.config.apiBaseUrl}/menu-items`; }

  constructor() { this.reload(); }

  private async reload() {
    try {
      this.items.set(await firstValueFrom(this.http.get<MenuItem[]>(this.url)));
      this.error.set('');
    } catch (e) {
      this.error.set(ApiService.message(e));
    }
    this.loaded.set(true);
  }

  protected add() {
    const next = Math.max(0, ...this.items().map((i) => i.sortOrder)) + 10;
    this.items.update((l) => [...l, { label: 'New entry', route: '/', icon: null, sortOrder: next, roles: null, isVisible: true }]);
  }

  protected async save(m: MenuItem) {
    this.busy.set(true);
    try {
      if (m.id) {
        await firstValueFrom(this.http.put(`${this.url}/${m.id}`, m));
      } else {
        const created = await firstValueFrom(this.http.post<MenuItem>(this.url, m));
        m.id = created.id;
      }
      this.toast.success('Menu saved.');
      await this.menuService.load(); // refresh the sidebar right away
    } catch (e) {
      this.toast.error(ApiService.message(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(m: MenuItem, index: number) {
    const ok = await this.confirm.ask('“{0}” will be removed from the menu.',
      { params: [m.label], title: 'Remove menu entry?', confirmText: 'Remove', danger: true });
    if (!ok) return;
    if (m.id) {
      try {
        await firstValueFrom(this.http.delete(`${this.url}/${m.id}`));
        await this.menuService.load();
      } catch (e) {
        this.toast.error(ApiService.message(e));
        return;
      }
    }
    this.items.update((l) => l.filter((_, i) => i !== index));
    this.toast.success('Entry removed.');
  }
}
