import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { StudioApi } from '../studio-api';
import { AppDef, EntityDef, FIELD_TYPES, hasTarget, plural, setTarget } from '../models';

@Component({
  selector: 'app-designer',
  imports: [FormsModule, RouterLink],
  template: `
    @if (loadError()) {
      <div class="alert warn">{{ loadError() }} <a routerLink="/">Back to projects</a></div>
    } @else if (def(); as d) {
      <div class="row" style="margin-bottom:1rem">
        <a routerLink="/" class="btn sm">← Projects</a>
        <h1 style="margin:0">Design: {{ d.name }}</h1>
        <span class="spacer"></span>
        @if (status()) { <span class="ok">{{ status() }}</span> }
        <button class="btn primary" (click)="save()">Save</button>
        <button class="btn" (click)="preview()">Preview</button>
        <button class="btn success" (click)="download()" [disabled]="errors().length > 0"
                [title]="errors().length ? 'Fix the problems below first' : ''">Download project (.zip)</button>
      </div>

      @if (errors().length > 0) {
        <div class="alert warn">
          <strong>Fix these before previewing or downloading:</strong>
          <ul>@for (e of errors(); track $index) { <li>{{ e }}</li> }</ul>
        </div>
      }

      <!-- Any edit inside bubbles an input/change event up here, which triggers re-validation. -->
      <div (input)="changed()" (change)="changed()">
        <div class="card">
          <div class="grid" style="grid-template-columns: 2fr 1.5fr 1.5fr">
            <div>
              <label for="name">System name</label>
              <input id="name" type="text" [(ngModel)]="d.name" name="name" />
            </div>
            <div>
              <label for="db">Database</label>
              <select id="db" [(ngModel)]="d.database" name="db">
                <option value="Sqlite">SQLite (easiest, single file)</option>
                <option value="SqlServer">SQL Server</option>
                <option value="PostgreSql">PostgreSQL</option>
                <option value="MySql" disabled>MySQL — coming soon</option>
                <option value="Oracle" disabled>Oracle — coming soon</option>
              </select>
            </div>
            <div>
              <label>Include</label>
              <label class="small" style="font-weight:400"><input type="checkbox" checked disabled /> Web API + Swagger</label>
              <label class="small" style="font-weight:400">
                <input type="checkbox" [checked]="has('WebApp')" (change)="toggle('WebApp', $event)" /> Angular web app
              </label>
              <label class="small" style="font-weight:400">
                <input type="checkbox" [checked]="has('Docker')" (change)="toggle('Docker', $event)" /> Docker files
              </label>
              <label class="small muted" style="font-weight:400"><input type="checkbox" disabled /> Flutter mobile app — coming soon</label>
            </div>
          </div>
        </div>

        <div class="row" style="margin-top:1.5rem">
          <h2 style="margin:0">Entities <span class="muted small">(each becomes a table, an API and a screen)</span></h2>
          <span class="spacer"></span>
          <button class="btn" (click)="addEntity()">+ Add entity</button>
        </div>

        @for (e of d.entities; track e) {
          <div class="card" style="margin-top:1rem">
            <div class="row" style="margin-bottom:.75rem">
              <input class="inline" type="text" [value]="e.name" placeholder="EntityName" (input)="rename(e, $any($event.target).value)" style="font-weight:600" />
              <span class="muted small">API: /api/{{ route(e) }}</span>
              <span class="spacer"></span>
              <button class="btn sm danger" (click)="removeEntity(e)">Remove entity</button>
            </div>

            <table>
              <thead><tr><th>Field</th><th>Type</th><th style="width:110px">Max length</th><th>Required</th><th>Unique</th><th></th></tr></thead>
              <tbody>
                @for (f of e.fields; track f) {
                  <tr>
                    <td><input type="text" [(ngModel)]="f.name" name="fname" /></td>
                    <td>
                      <select [(ngModel)]="f.type" name="ftype">
                        @for (t of fieldTypes; track t) { <option [value]="t">{{ t }}</option> }
                      </select>
                    </td>
                    <td><input type="number" min="1" [(ngModel)]="f.maxLength" name="fmax" /></td>
                    <td><input type="checkbox" [(ngModel)]="f.required" name="freq" /></td>
                    <td><input type="checkbox" [(ngModel)]="f.unique" name="funi" /></td>
                    <td style="text-align:right"><button class="btn sm danger" (click)="removeField(e, f)">✕</button></td>
                  </tr>
                }
              </tbody>
            </table>
            <div style="margin-top:.5rem"><button class="btn sm" (click)="addField(e)">+ Field</button></div>

            <h3 style="font-size:.95rem; margin:1rem 0 .5rem">Links to other entities</h3>
            @for (r of e.relations; track r) {
              <div class="row" style="margin-bottom:.35rem">
                <input class="inline" type="text" [(ngModel)]="r.name" name="rname" />
                <span>→</span>
                <select class="inline" [(ngModel)]="r.targetEntity" name="rtarget">
                  <option value="">(choose)</option>
                  @for (o of entityNames(); track o) { <option [value]="o">{{ o }}</option> }
                </select>
                <label class="small" style="font-weight:400; margin:0"><input type="checkbox" [(ngModel)]="r.required" name="rreq" /> required</label>
                <button class="btn sm danger" (click)="removeRelation(e, r)">✕</button>
              </div>
            }
            <button class="btn sm" (click)="addRelation(e)">+ Link</button>
          </div>
        }
      </div>
    } @else {
      <p class="muted">Loading…</p>
    }
  `
})
export class DesignerPage {
  readonly id = input.required<string>();

  private readonly api = inject(StudioApi);
  private readonly router = inject(Router);

  protected readonly def = signal<AppDef | null>(null);
  protected readonly errors = signal<string[]>([]);
  protected readonly status = signal('');
  protected readonly loadError = signal('');
  protected readonly fieldTypes = FIELD_TYPES;
  protected readonly entityNames = computed(() => (this.def()?.entities ?? []).map((e) => e.name).filter((n) => !!n));

  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  private async load(id: string) {
    this.loadError.set('');
    this.def.set(null);
    try {
      const d = await this.api.get(id);
      this.def.set(d);
      await this.validate();
    } catch {
      this.loadError.set('Project not found.');
    }
  }

  protected has(target: string) { return hasTarget(this.def()!, target); }
  protected route(e: EntityDef) { return plural(e.name).toLowerCase(); }

  protected toggle(target: string, ev: Event) {
    setTarget(this.def()!, target, (ev.target as HTMLInputElement).checked);
  }

  /** Re-validates shortly after the user stops typing. */
  protected changed() {
    this.status.set('');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.validate(), 300);
  }

  private async validate() {
    const d = this.def();
    if (!d) return;
    try { this.errors.set((await this.api.validate(d)).errors); }
    catch (e) { this.errors.set(StudioApi.errors(e)); }
  }

  protected async save() {
    const d = this.def();
    if (!d) return;
    try {
      await this.api.save(this.id(), d);
      this.status.set('Saved ' + new Date().toLocaleTimeString());
    } catch (e) {
      this.errors.set(StudioApi.errors(e));
    }
  }

  protected async preview() {
    await this.save();
    await this.router.navigate(['/preview', this.id()]);
  }

  protected async download() {
    await this.save();
    window.location.href = `/download/${this.id()}`;
  }

  protected addEntity() {
    const d = this.def()!;
    d.entities.push({ name: 'NewEntity' + (d.entities.length + 1), fields: [{ name: 'Name', type: 'String', required: true, unique: false }], relations: [] });
    this.changed();
  }

  protected removeEntity(e: EntityDef) {
    const d = this.def()!;
    d.entities = d.entities.filter((x) => x !== e);
    for (const other of d.entities) other.relations = other.relations.filter((r) => r.targetEntity !== e.name);
    this.changed();
  }

  protected rename(e: EntityDef, newName: string) {
    for (const other of this.def()!.entities)
      for (const r of other.relations) if (r.targetEntity === e.name) r.targetEntity = newName;
    e.name = newName;
  }

  protected addField(e: EntityDef) {
    e.fields.push({ name: '', type: 'String', required: false, unique: false });
    this.changed();
  }
  protected removeField(e: EntityDef, f: EntityDef['fields'][number]) {
    e.fields = e.fields.filter((x) => x !== f);
    this.changed();
  }

  protected addRelation(e: EntityDef) {
    const target = this.def()!.entities.find((x) => x !== e && x.name)?.name ?? '';
    e.relations.push({ name: target, targetEntity: target, required: true });
    this.changed();
  }
  protected removeRelation(e: EntityDef, r: EntityDef['relations'][number]) {
    e.relations = e.relations.filter((x) => x !== r);
    this.changed();
  }
}
