import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService, Row } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { EntityMeta, MetaService } from '../core/meta.service';
import { ToastService } from '../core/toast.service';
import { Icon } from '../ui/icon';

@Component({
  selector: 'app-entity-form',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    @if (meta(); as m) {
      <div class="page" style="max-width:860px">
        <div class="page-header">
          <div class="titles">
            <span class="crumbs"><a [routerLink]="['/e', m.route]">{{ m.plural }}</a> / {{ id() ? 'Edit' : 'New' }}</span>
            <h1>{{ id() ? 'Edit' : 'New' }} {{ m.label }}</h1>
          </div>
        </div>

        @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() }}</div> }

        @if (loading()) {
          <div class="card">
            @for (i of [1, 2, 3, 4]; track i) { <div class="skeleton" style="height:2.4rem; margin-bottom:1rem"></div> }
          </div>
        } @else {
          <form class="card" (ngSubmit)="save(m)">
            @if (readOnly(m)) { <div class="alert info"><app-icon name="eye" /> You can view this record but not change it.</div> }
            <fieldset [disabled]="readOnly(m)" style="border:0;padding:0;margin:0;min-width:0">
            <div class="form-grid">
              @for (f of m.fields; track f.key) {
                <div [class.full]="f.type === 'Text'">
                  <label class="lbl" [for]="f.key">{{ f.label }}@if (f.required) { <span class="req"> *</span> }</label>
                  @switch (f.type) {
                    @case ('Text') {
                      <textarea [id]="f.key" [name]="f.key" rows="4" [(ngModel)]="model[f.key]" [required]="f.required"></textarea>
                    }
                    @case ('Bool') {
                      <label class="row" style="gap:.6rem; padding:.4rem 0"><input [id]="f.key" [name]="f.key" type="checkbox" [(ngModel)]="model[f.key]" /> <span class="muted">Enabled</span></label>
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
                <div>
                  <label class="lbl" [for]="r.key">{{ r.label }}@if (r.required) { <span class="req"> *</span> }</label>
                  <select [id]="r.key" [name]="r.key" [(ngModel)]="model[r.key]" [required]="r.required">
                    <option [ngValue]="null">— choose —</option>
                    @for (o of options()[r.key]; track o.id) { <option [ngValue]="o.id">{{ o.text }}</option> }
                  </select>
                </div>
              }
            </div>
            </fieldset>
            <div class="row" style="margin-top:1.5rem; padding-top:1.25rem; border-top:1px solid var(--border); justify-content:flex-end">
              <a class="btn" [routerLink]="['/e', m.route]">{{ readOnly(m) ? 'Back' : 'Cancel' }}</a>
              @if (!readOnly(m)) {
                <button class="btn primary" type="submit" [disabled]="busy()"><app-icon name="check" [size]="16" /> {{ busy() ? 'Saving…' : 'Save' }}</button>
              }
            </div>
          </form>
        }
      </div>
    } @else {
      <div class="alert error"><app-icon name="alert" /> Unknown section.</div>
    }
  `
})
export class EntityFormPage {
  readonly entity = input.required<string>();
  readonly id = input<string>();

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly metaService = inject(MetaService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  protected readonly meta = computed(() => this.metaService.byRoute(this.entity()));
  /** Opening a record without the Edit permission (or starting a new one without Create) shows it read-only. */
  protected readOnly(m: EntityMeta) { return !this.auth.can(m.route + (this.id() ? '.edit' : '.create')); }
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
    this.busy.set(false);
    this.model = {};
    for (const f of m.fields) this.model[f.key] = f.type === 'Bool' ? false : null;
    for (const r of m.relations) this.model[r.key] = null;

    for (const r of m.relations) {
      const target = this.metaService.byName(r.target);
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
      next: () => { this.toast.success(`${m.label} saved.`); this.router.navigate(['/e', m.route]); },
      error: (e: unknown) => { this.error.set(ApiService.message(e)); this.busy.set(false); }
    });
  }
}
