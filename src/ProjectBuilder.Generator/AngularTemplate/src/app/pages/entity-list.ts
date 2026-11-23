import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Paged, Row } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ENTITIES, EntityMeta } from '../entities';

@Component({
  selector: 'app-entity-list',
  imports: [RouterLink],
  template: `
    @if (meta(); as m) {
      <div class="toolbar">
        <h1>{{ m.plural }}</h1>
        <span class="spacer"></span>
        <a class="btn primary" [routerLink]="['/e', m.route, 'new']">+ New {{ m.label }}</a>
      </div>
      @if (error()) { <div class="error">{{ error() }}</div> }
      <table>
        <thead>
          <tr>
            @for (f of m.fields; track f.key) { <th>{{ f.label }}</th> }
            @for (r of m.relations; track r.key) { <th>{{ r.label }}</th> }
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (row of data()?.items ?? []; track row['id']) {
            <tr>
              @for (f of m.fields; track f.key) { <td>{{ show(f.type, row[f.key]) }}</td> }
              @for (r of m.relations; track r.key) { <td>{{ lookup(r.key, row[r.key]) }}</td> }
              <td style="text-align:right; white-space:nowrap">
                <a class="btn" [routerLink]="['/e', m.route, row['id']]">Edit</a>
                @if (auth.isAdmin()) {
                  <button class="btn danger" (click)="remove(m, row)">Delete</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td [attr.colspan]="m.fields.length + m.relations.length + 1" class="muted">No records yet.</td></tr>
          }
        </tbody>
      </table>
      <div class="toolbar" style="margin-top:1rem">
        <button class="btn" (click)="page.set(page() - 1)" [disabled]="page() <= 1">‹ Prev</button>
        <span class="muted">Page {{ page() }} of {{ pages() }} · {{ data()?.total ?? 0 }} records</span>
        <button class="btn" (click)="page.set(page() + 1)" [disabled]="page() >= pages()">Next ›</button>
      </div>
    } @else {
      <div class="error">Unknown section.</div>
    }
  `
})
export class EntityListPage {
  readonly entity = input.required<string>();

  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);

  protected readonly meta = computed(() => ENTITIES.find((e) => e.route === this.entity()));
  protected readonly page = linkedSignal({ source: this.entity, computation: () => 1 });
  protected readonly data = signal<Paged<Row> | null>(null);
  protected readonly error = signal('');
  private readonly lookups = signal<Record<string, Record<string, string>>>({});
  protected readonly pages = computed(() => Math.max(1, Math.ceil((this.data()?.total ?? 0) / 20)));

  constructor() {
    effect(() => {
      const m = this.meta();
      const p = this.page();
      if (m) untracked(() => this.load(m, p));
    });
  }

  private load(m: EntityMeta, page: number) {
    this.error.set('');
    this.api.list(m.route, page, 20).subscribe({
      next: (d) => this.data.set(d),
      error: (e) => this.error.set(ApiService.message(e))
    });
    for (const r of m.relations) {
      const target = ENTITIES.find((e) => e.name === r.target);
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
    if (type === 'Bool') return v ? 'Yes' : 'No';
    if (type === 'Date') return String(v).slice(0, 10);
    if (type === 'DateTime') return String(v).replace('T', ' ').slice(0, 16);
    return String(v);
  }

  protected lookup(key: string, id: unknown): string {
    if (!id) return '';
    return this.lookups()[key]?.[String(id)] ?? String(id);
  }

  protected remove(m: EntityMeta, row: Row) {
    if (!confirm(`Delete this ${m.label}?`)) return;
    this.api.remove(m.route, row['id']).subscribe({
      next: () => this.load(m, this.page()),
      error: (e) => this.error.set(ApiService.message(e))
    });
  }
}
