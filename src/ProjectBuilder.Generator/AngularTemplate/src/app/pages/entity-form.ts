import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService, Row } from '../core/api.service';
import { ENTITIES, EntityMeta } from '../entities';

@Component({
  selector: 'app-entity-form',
  imports: [FormsModule, RouterLink],
  template: `
    @if (meta(); as m) {
      <h1>{{ id() ? 'Edit' : 'New' }} {{ m.label }}</h1>
      @if (error()) { <div class="error">{{ error() }}</div> }
      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else {
      <form class="card" (ngSubmit)="save(m)" style="max-width:640px">
        @for (f of m.fields; track f.key) {
          <div class="field">
            <label [for]="f.key">{{ f.label }}@if (f.required) { <span style="color:var(--danger)"> *</span> }</label>
            @switch (f.type) {
              @case ('Text') {
                <textarea [id]="f.key" [name]="f.key" rows="4" [(ngModel)]="model[f.key]" [required]="f.required"></textarea>
              }
              @case ('Bool') {
                <input [id]="f.key" [name]="f.key" type="checkbox" [(ngModel)]="model[f.key]" />
              }
              @case ('Int') { <input [id]="f.key" [name]="f.key" type="number" step="1" [(ngModel)]="model[f.key]" [required]="f.required" /> }
              @case ('Long') { <input [id]="f.key" [name]="f.key" type="number" step="1" [(ngModel)]="model[f.key]" [required]="f.required" /> }
              @case ('Decimal') { <input [id]="f.key" [name]="f.key" type="number" step="0.01" [(ngModel)]="model[f.key]" [required]="f.required" /> }
              @case ('Date') { <input [id]="f.key" [name]="f.key" type="date" [(ngModel)]="model[f.key]" [required]="f.required" /> }
              @case ('DateTime') { <input [id]="f.key" [name]="f.key" type="datetime-local" [(ngModel)]="model[f.key]" [required]="f.required" /> }
              @case ('Email') { <input [id]="f.key" [name]="f.key" type="email" [attr.maxlength]="f.maxLength" [(ngModel)]="model[f.key]" [required]="f.required" /> }
              @case ('Phone') { <input [id]="f.key" [name]="f.key" type="tel" [attr.maxlength]="f.maxLength" [(ngModel)]="model[f.key]" [required]="f.required" /> }
              @default { <input [id]="f.key" [name]="f.key" type="text" [attr.maxlength]="f.maxLength" [(ngModel)]="model[f.key]" [required]="f.required" /> }
            }
          </div>
        }
        @for (r of m.relations; track r.key) {
          <div class="field">
            <label [for]="r.key">{{ r.label }}@if (r.required) { <span style="color:var(--danger)"> *</span> }</label>
            <select [id]="r.key" [name]="r.key" [(ngModel)]="model[r.key]" [required]="r.required">
              <option [ngValue]="null">— choose —</option>
              @for (o of options()[r.key]; track o.id) { <option [ngValue]="o.id">{{ o.text }}</option> }
            </select>
          </div>
        }
        <div class="toolbar">
          <button class="btn primary" type="submit" [disabled]="busy()">Save</button>
          <a class="btn" [routerLink]="['/e', m.route]">Cancel</a>
        </div>
      </form>
      }
    } @else {
      <div class="error">Unknown section.</div>
    }
  `
})
export class EntityFormPage {
  readonly entity = input.required<string>();
  readonly id = input<string>();

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly meta = computed(() => ENTITIES.find((e) => e.route === this.entity()));
  protected model: Row = {};
  protected readonly options = signal<Record<string, { id: string; text: string }[]>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  // The app runs without zone.js, so async results must go through signals for the view to refresh.
  protected readonly loading = signal(false);

  constructor() {
    effect(() => {
      const m = this.meta();
      const id = this.id();
      if (m) untracked(() => this.init(m, id));
    });
  }

  private init(m: EntityMeta, id: string | undefined) {
    this.error.set('');
    this.model = {};
    for (const f of m.fields) this.model[f.key] = f.type === 'Bool' ? false : null;
    for (const r of m.relations) this.model[r.key] = null;

    for (const r of m.relations) {
      const target = ENTITIES.find((e) => e.name === r.target);
      if (!target) continue;
      this.api.list(target.route, 1, 200).subscribe((d) =>
        this.options.update((o) => ({
          ...o,
          [r.key]: d.items.map((i) => ({ id: i['id'], text: String(i[target.display] ?? i['id']) }))
        }))
      );
    }

    this.loading.set(!!id);
    if (id) {
      this.api.get(m.route, id).subscribe({
        next: (row) => {
          for (const f of m.fields) {
            const v = row[f.key];
            this.model[f.key] =
              v == null ? (f.type === 'Bool' ? false : null)
              : f.type === 'Date' ? String(v).slice(0, 10)
              : f.type === 'DateTime' ? String(v).slice(0, 16)
              : v;
          }
          for (const r of m.relations) this.model[r.key] = row[r.key] ?? null;
          this.loading.set(false);
        },
        error: (e) => { this.error.set(ApiService.message(e)); this.loading.set(false); }
      });
    }
  }

  protected save(m: EntityMeta) {
    this.error.set('');
    this.busy.set(true);
    // Empty text inputs are sent as null so optional values stay empty instead of "".
    const body: Row = {};
    for (const [k, v] of Object.entries(this.model)) body[k] = v === '' ? null : v;

    const id = this.id();
    const call: Observable<unknown> = id ? this.api.update(m.route, id, body) : this.api.create(m.route, body);
    call.subscribe({
      next: () => this.router.navigate(['/e', m.route]),
      error: (e: unknown) => { this.error.set(ApiService.message(e)); this.busy.set(false); }
    });
  }
}
