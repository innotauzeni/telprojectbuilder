import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Paged, Row } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ConfirmService } from '../core/confirm.service';
import { EntityMeta, MetaService } from '../core/meta.service';
import { ToastService } from '../core/toast.service';
import { Icon } from '../ui/icon';

@Component({
  selector: 'app-entity-list',
  imports: [RouterLink, Icon],
  template: `
    @if (meta(); as m) {
      <div class="page">
        <div class="page-header">
          <div class="titles">
            <h1>{{ m.plural }} @if (data()) { <span class="badge primary" style="vertical-align:middle">{{ data()!.total }}</span> }</h1>
            <span class="muted small">Manage your {{ m.plural.toLowerCase() }}</span>
          </div>
          <span class="spacer"></span>
          <div style="position:relative; width:230px">
            <span style="position:absolute; left:.7rem; top:50%; transform:translateY(-50%); color:var(--muted)"><app-icon name="search" [size]="16" /></span>
            <input type="text" placeholder="Filter this page…" aria-label="Filter rows" style="padding-left:2.1rem" (input)="filter.set($any($event.target).value)" />
          </div>
          @if (auth.can(m.route + '.create')) {
            <a class="btn primary" [routerLink]="['/e', m.route, 'new']"><app-icon name="plus" [size]="16" /> New {{ m.label }}</a>
          }
        </div>

        @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() }}</div> }

        <div class="card table-card">
          <div class="table-scroll">
            <table class="data">
              <thead>
                <tr>
                  @for (f of m.fields; track f.key) { <th>{{ f.label }}</th> }
                  @for (r of m.relations; track r.key) { <th>{{ r.label }}</th> }
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @if (loading()) {
                  @for (i of [1, 2, 3, 4]; track i) {
                    <tr><td [attr.colspan]="m.fields.length + m.relations.length + 1"><div class="skeleton" style="height:1.1rem"></div></td></tr>
                  }
                } @else {
                  @for (row of rows(); track row['id']) {
                    <tr>
                      @for (f of m.fields; track f.key) {
                        <td>
                          @if (f.type === 'Bool') {
                            <span class="badge" [class.ok]="row[f.key]" [class.no]="!row[f.key]">{{ row[f.key] ? 'Yes' : 'No' }}</span>
                          } @else { {{ show(f.type, row[f.key]) }} }
                        </td>
                      }
                      @for (r of m.relations; track r.key) {
                        <td>@if (row[r.key]) { <span class="chip">{{ lookup(r.key, row[r.key]) }}</span> }</td>
                      }
                      <td class="actions">
                        @if (auth.can(m.route + '.edit')) {
                          <a class="btn icon ghost" [routerLink]="['/e', m.route, row['id']]" aria-label="Edit" title="Edit"><app-icon name="edit" [size]="16" /></a>
                        } @else {
                          <a class="btn icon ghost" [routerLink]="['/e', m.route, row['id']]" aria-label="View details" title="View details"><app-icon name="eye" [size]="16" /></a>
                        }
                        @if (auth.can(m.route + '.delete', true)) {
                          <button class="btn icon ghost danger" (click)="remove(m, row)" aria-label="Delete" title="Delete"><app-icon name="trash" [size]="16" /></button>
                        }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>

          @if (!loading() && rows().length === 0) {
            <div class="empty">
              <div class="ico"><app-icon [name]="m.icon" [size]="26" /></div>
              <h3>No records yet</h3>
              <p>@if (filter()) { Nothing on this page matches “{{ filter() }}”. } @else { Create the first {{ m.label.toLowerCase() }} to get started. }</p>
              @if (!filter() && auth.can(m.route + '.create')) { <a class="btn primary" [routerLink]="['/e', m.route, 'new']"><app-icon name="plus" [size]="16" /> New {{ m.label }}</a> }
            </div>
          }
        </div>

        <div class="row" style="margin-top:1rem; justify-content:space-between">
          <span class="muted small">Page {{ page() }} of {{ pages() }} · {{ data()?.total ?? 0 }} records</span>
          <div class="row">
            <button class="btn" (click)="page.set(page() - 1)" [disabled]="page() <= 1"><app-icon name="chevron-left" [size]="16" /> Previous</button>
            <button class="btn" (click)="page.set(page() + 1)" [disabled]="page() >= pages()">Next <app-icon name="chevron-right" [size]="16" /></button>
          </div>
        </div>
      </div>
    } @else {
      <div class="alert error"><app-icon name="alert" /> Unknown section.</div>
    }
  `
})
export class EntityListPage {
  readonly entity = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly metaService = inject(MetaService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  protected readonly meta = computed(() => this.metaService.byRoute(this.entity()));
  protected readonly page = linkedSignal({ source: this.entity, computation: () => 1 });
  protected readonly data = signal<Paged<Row> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly filter = signal('');
  private readonly lookups = signal<Record<string, Record<string, string>>>({});
  protected readonly pages = computed(() => Math.max(1, Math.ceil((this.data()?.total ?? 0) / 20)));

  // Client-side filter over the rows of the current page.
  protected readonly rows = computed(() => {
    const items = this.data()?.items ?? [];
    const q = this.filter().trim().toLowerCase();
    return q ? items.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q))) : items;
  });

  constructor() {
    effect(() => {
      const m = this.meta();
      const p = this.page();
      if (m) untracked(() => this.load(m, p));
    });
  }

  private load(m: EntityMeta, page: number) {
    this.error.set('');
    this.loading.set(true);
    this.api.list(m.route, page, 20).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (e) => { this.error.set(ApiService.message(e)); this.loading.set(false); }
    });
    for (const r of m.relations) {
      const target = this.metaService.byName(r.target);
      if (!target) continue;
      this.api.list(target.route, 1, 200).subscribe((d) => {
        const map: Record<string, string> = {};
        for (const item of d.items) map[item['id']] = String(item[target.display] ?? item['id']);
        this.lookups.update((l) => ({ ...l, [r.key]: map }));
      });
    }
  }

  protected show(type: string, v: unknown): string {
    if (v === null || v === undefined || v === '') return '';
    if (type === 'Date') return String(v).slice(0, 10);
    if (type === 'DateTime') return String(v).replace('T', ' ').slice(0, 16);
    return String(v);
  }

  protected lookup(key: string, id: unknown): string {
    return this.lookups()[key]?.[String(id)] ?? '…';
  }

  protected async remove(m: EntityMeta, row: Row) {
    const ok = await this.confirm.ask(`This ${m.label.toLowerCase()} will be permanently deleted.`,
      { title: `Delete ${m.label.toLowerCase()}?`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    this.api.remove(m.route, row['id']).subscribe({
      next: () => { this.toast.success(`${m.label} deleted.`); this.load(m, this.page()); },
      error: (e) => this.toast.error(ApiService.message(e))
    });
  }
}
