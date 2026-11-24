import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmService } from '../core/confirm.service';
import { ToastService } from '../core/toast.service';
import { StudioApi } from '../studio-api';
import { AppDef, EntityDef, FIELD_TYPES, hasTarget, plural, setTarget } from '../models';
import { Icon } from '../ui/icon';

@Component({
  selector: 'app-designer',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    @if (loadError()) {
      <div class="alert error"><app-icon name="alert" />{{ loadError() }} <a routerLink="/">Back to projects</a></div>
    } @else if (def(); as d) {
      <div class="bar">
        <a routerLink="/" class="btn ghost"><app-icon name="chevron-left" [size]="16" /> Projects</a>
        <div class="titles">
          <span class="crumbs">Designer</span>
          <h1 style="font-size:1.35rem">{{ d.name || 'Untitled system' }}</h1>
        </div>
        <span class="spacer"></span>
        @if (saving()) { <span class="muted small">Saving…</span> }
        @else if (dirty()) { <span class="badge" style="background:var(--warn-soft);color:var(--warn)">Unsaved changes</span> }
        @else { <span class="badge ok"><app-icon name="check" [size]="12" /> Saved</span> }
        <button class="btn" (click)="save()"><app-icon name="save" [size]="16" /> Save</button>
        <button class="btn" (click)="preview()"><app-icon name="eye" [size]="16" /> Preview</button>
        <button class="btn primary" (click)="download()" [disabled]="errors().length > 0"
                [title]="errors().length ? 'Fix the problems below first' : ''"><app-icon name="download" [size]="16" /> Download</button>
      </div>

      @if (errors().length > 0) {
        <div class="alert error" role="alert" style="flex-direction:column; gap:.25rem">
          <strong><app-icon name="alert" [size]="16" /> Fix these before previewing or downloading</strong>
          <ul style="margin:0; padding-left:1.2rem">@for (e of errors(); track $index) { <li>{{ e }}</li> }</ul>
        </div>
      }

      <!-- Any edit inside bubbles an input/change event up here, which triggers re-validation. -->
      <div (input)="changed()" (change)="changed()">
        <div class="card">
          <h2 style="margin-bottom:1rem">Project</h2>
          <div class="form-grid">
            <div>
              <label class="lbl" for="name">System name</label>
              <input id="name" type="text" [(ngModel)]="d.name" name="name" placeholder="e.g. School Management" />
            </div>
            <div>
              <label class="lbl" for="db">Database</label>
              <select id="db" [(ngModel)]="d.database" name="db">
                <option value="Sqlite">SQLite — easiest, single file</option>
                <option value="SqlServer">Microsoft SQL Server</option>
                <option value="PostgreSql">PostgreSQL</option>
                <option value="MySql" disabled>MySQL — coming soon</option>
                <option value="Oracle" disabled>Oracle — coming soon</option>
              </select>
            </div>
          </div>

          <h3 style="margin:1.5rem 0 .75rem; font-size:.95rem">What to generate</h3>
          <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">
            <div class="tile on locked">
              <span class="ico"><app-icon name="code" /></span>
              <div><div class="t">Web API + Swagger</div><div class="muted small">C# ASP.NET Core, login &amp; roles. Always included.</div></div>
              <span class="switch"></span>
            </div>
            <div class="tile" [class.on]="has('WebApp')" (click)="toggle('WebApp')" role="switch" [attr.aria-checked]="has('WebApp')" tabindex="0" (keydown.enter)="toggle('WebApp')" (keydown.space)="toggle('WebApp')">
              <span class="ico"><app-icon name="globe" /></span>
              <div><div class="t">Angular web app</div><div class="muted small">Modern admin UI with dark mode, ready to deploy.</div></div>
              <span class="switch"></span>
            </div>
            <div class="tile" [class.on]="d.dynamicMenu" (click)="toggleMenu()" role="switch" [attr.aria-checked]="d.dynamicMenu" tabindex="0" (keydown.enter)="toggleMenu()" (keydown.space)="toggleMenu()">
              <span class="ico"><app-icon name="list" /></span>
              <div><div class="t">Dynamic menu</div><div class="muted small">Menu stored in a database table; admins edit it without redeploying.</div></div>
              <span class="switch"></span>
            </div>
            <div class="tile" [class.on]="has('Docker')" (click)="toggle('Docker')" role="switch" [attr.aria-checked]="has('Docker')" tabindex="0" (keydown.enter)="toggle('Docker')" (keydown.space)="toggle('Docker')">
              <span class="ico"><app-icon name="box" /></span>
              <div><div class="t">Docker files</div><div class="muted small">Dockerfile and docker-compose for the whole stack.</div></div>
              <span class="switch"></span>
            </div>
            <div class="tile locked" style="opacity:.55">
              <span class="ico"><app-icon name="smartphone" /></span>
              <div><div class="t">Flutter mobile app</div><div class="muted small">Coming soon.</div></div>
              <span class="badge">Soon</span>
            </div>
          </div>
          @if (d.dynamicMenu) {
            <p class="hint" style="margin-top:.75rem"><app-icon name="check" [size]="12" /> A <b>MenuItems</b> table and the <code>/api/menu</code> endpoints will be created
              {{ has('WebApp') ? 'and the web app gets a Menu editor for admins.' : '. Turn on the Angular web app to get the editor screen.' }}</p>
          }
        </div>

        <div class="row" style="margin:1.75rem 0 .75rem">
          <h2>Entities <span class="muted small" style="font-weight:400">each becomes a table, an API and a screen</span></h2>
          <span class="spacer"></span>
          <button class="btn primary" (click)="addEntity()"><app-icon name="plus" [size]="16" /> Add entity</button>
        </div>

        @for (e of d.entities; track e) {
          <div class="card" style="margin-bottom:1rem">
            <div class="entity-head" style="margin-bottom:.9rem">
              <span class="chip" style="display:inline-grid;place-items:center;width:34px;height:34px;padding:0"><app-icon name="table" [size]="18" /></span>
              <input type="text" [value]="e.name" placeholder="EntityName" (input)="rename(e, $any($event.target).value)" style="width:220px; font-weight:650" aria-label="Entity name" />
              <span class="muted small">API: <code>/api/{{ route(e) }}</code></span>
              <span class="spacer"></span>
              <span class="badge">{{ e.fields.length }} fields</span>
              <button class="btn icon ghost danger" (click)="removeEntity(e)" aria-label="Remove entity"><app-icon name="trash" [size]="16" /></button>
            </div>

            <div class="field-row field-head"><span>Field</span><span>Type</span><span>Max length</span><span>Required</span><span>Unique</span><span></span></div>
            @for (f of e.fields; track f) {
              <div class="field-row">
                <input type="text" [(ngModel)]="f.name" name="fname" placeholder="FieldName" aria-label="Field name" />
                <select [(ngModel)]="f.type" name="ftype" aria-label="Field type">
                  @for (t of fieldTypes; track t) { <option [value]="t">{{ t }}</option> }
                </select>
                <input type="number" min="1" [(ngModel)]="f.maxLength" name="fmax" placeholder="—" aria-label="Max length" />
                <label class="row small" style="gap:.35rem"><input type="checkbox" [(ngModel)]="f.required" name="freq" /> Req.</label>
                <label class="row small" style="gap:.35rem"><input type="checkbox" [(ngModel)]="f.unique" name="funi" /> Uniq.</label>
                <button class="btn icon ghost danger" (click)="removeField(e, f)" aria-label="Remove field"><app-icon name="x" [size]="16" /></button>
              </div>
            }
            <button class="btn" style="margin-top:.5rem" (click)="addField(e)"><app-icon name="plus" [size]="15" /> Field</button>

            <h3 style="margin:1.25rem 0 .5rem; font-size:.9rem">Links to other entities</h3>
            @for (r of e.relations; track r) {
              <div class="row" style="margin-bottom:.4rem">
                <input type="text" [(ngModel)]="r.name" name="rname" style="width:180px" aria-label="Link name" />
                <app-icon name="chevron-right" [size]="16" />
                <select [(ngModel)]="r.targetEntity" name="rtarget" style="width:200px" aria-label="Linked entity">
                  <option value="">(choose)</option>
                  @for (o of entityNames(); track o) { <option [value]="o">{{ o }}</option> }
                </select>
                <label class="row small" style="gap:.35rem"><input type="checkbox" [(ngModel)]="r.required" name="rreq" /> required</label>
                <button class="btn icon ghost danger" (click)="removeRelation(e, r)" aria-label="Remove link"><app-icon name="x" [size]="16" /></button>
              </div>
            }
            <button class="btn" (click)="addRelation(e)"><app-icon name="plus" [size]="15" /> Link</button>
          </div>
        }

        @if (d.entities.length === 0) {
          <div class="card empty">
            <div class="ico"><app-icon name="table" [size]="26" /></div>
            <h3>No entities yet</h3>
            <p>An entity is something you keep records of, such as Student, Product or Invoice.</p>
            <button class="btn primary" (click)="addEntity()"><app-icon name="plus" [size]="16" /> Add your first entity</button>
          </div>
        }
      </div>
    } @else {
      <div class="card"><div class="skeleton" style="height:1.6rem;width:40%;margin-bottom:1rem"></div><div class="skeleton" style="height:6rem"></div></div>
    }
  `,
  styles: `
    .bar { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; margin-bottom: 1.25rem; position: sticky; top: 56px; z-index: 30; padding: .6rem 0; background: var(--bg); }
    .titles { display: flex; flex-direction: column; }
    code { background: var(--surface-2); padding: .05rem .35rem; border-radius: 5px; font-size: .85em; }
  `
})
export class DesignerPage {
  readonly id = input.required<string>();

  private readonly api = inject(StudioApi);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly def = signal<AppDef | null>(null);
  protected readonly errors = signal<string[]>([]);
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
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
      d.dynamicMenu = d.dynamicMenu === true;
      this.def.set(d);
      this.dirty.set(false);
      await this.validate();
    } catch {
      this.loadError.set('Project not found.');
    }
  }

  protected has(target: string) { return hasTarget(this.def()!, target); }
  protected route(e: EntityDef) { return plural(e.name).toLowerCase(); }

  protected toggle(target: string) {
    const d = this.def()!;
    setTarget(d, target, !hasTarget(d, target));
    this.changed();
  }

  protected toggleMenu() {
    const d = this.def()!;
    d.dynamicMenu = !d.dynamicMenu;
    this.changed();
  }

  /** Re-validates shortly after the user stops typing. */
  protected changed() {
    this.dirty.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.validate(), 300);
  }

  private async validate() {
    const d = this.def();
    if (!d) return;
    try { this.errors.set((await this.api.validate(d)).errors); }
    catch (e) { this.errors.set(StudioApi.errors(e)); }
  }

  protected async save(): Promise<boolean> {
    const d = this.def();
    if (!d) return false;
    this.saving.set(true);
    try {
      await this.api.save(this.id(), d);
      this.dirty.set(false);
      this.toast.success('Project saved.');
      return true;
    } catch (e) {
      this.toast.error(StudioApi.errors(e).join(' '));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  protected async preview() {
    if (await this.save()) await this.router.navigate(['/preview', this.id()]);
  }

  protected async download() {
    if (await this.save()) window.location.href = `/download/${this.id()}`;
  }

  protected addEntity() {
    const d = this.def()!;
    d.entities.push({ name: 'NewEntity' + (d.entities.length + 1), fields: [{ name: 'Name', type: 'String', required: true, unique: false }], relations: [] });
    this.changed();
  }

  protected async removeEntity(e: EntityDef) {
    const ok = await this.confirm.ask(`“${e.name}” and links pointing to it will be removed from the design.`,
      { title: 'Remove entity?', confirmText: 'Remove', danger: true });
    if (!ok) return;
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
