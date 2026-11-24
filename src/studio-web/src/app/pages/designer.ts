import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmService } from '../core/confirm.service';
import { ToastService } from '../core/toast.service';
import { StudioApi } from '../studio-api';
import { AppDef, EntityDef, FIELD_TYPES, hasTarget, plural, setTarget } from '../models';
import { Icon } from '../ui/icon';
import { T } from '../ui/t.pipe';

@Component({
  selector: 'app-designer',
  imports: [FormsModule, RouterLink, Icon, T],
  template: `
    @if (loadError()) {
      <div class="alert error"><app-icon name="alert" />{{ loadError() }} <a routerLink="/">{{ 'Back to projects' | t }}</a></div>
    } @else if (def(); as d) {
      <div class="bar">
        <a routerLink="/" class="btn ghost"><app-icon name="chevron-left" [size]="16" /> {{ 'Projects' | t }}</a>
        <div class="titles">
          <span class="crumbs">{{ 'Designer' | t }}</span>
          <h1 style="font-size:1.35rem">{{ d.name || ('Untitled system' | t) }}</h1>
        </div>
        <span class="spacer"></span>
        @if (saving()) { <span class="muted small">{{ 'Saving…' | t }}</span> }
        @else if (dirty()) { <span class="badge" style="background:var(--warn-soft);color:var(--warn)">{{ 'Unsaved changes' | t }}</span> }
        @else { <span class="badge ok"><app-icon name="check" [size]="12" /> {{ 'Saved' | t }}</span> }
        <button class="btn" (click)="save()"><app-icon name="save" [size]="16" /> {{ 'Save' | t }}</button>
        <button class="btn" (click)="preview()"><app-icon name="eye" [size]="16" /> {{ 'Preview' | t }}</button>
        <button class="btn primary" (click)="download()" [disabled]="errors().length > 0"
                [title]="(errors().length ? 'Fix the problems below first' : '') | t"><app-icon name="download" [size]="16" /> {{ 'Download' | t }}</button>
      </div>

      @if (errors().length > 0) {
        <div class="alert error" role="alert" style="flex-direction:column; gap:.25rem">
          <strong><app-icon name="alert" [size]="16" /> {{ 'Fix these before previewing or downloading' | t }}</strong>
          <ul style="margin:0; padding-left:1.2rem">@for (e of errors(); track $index) { <li>{{ e | t }}</li> }</ul>
        </div>
      }

      <!-- Any edit inside bubbles an input/change event up here, which triggers re-validation. -->
      <div (input)="changed()" (change)="changed()">
        <div class="card">
          <h2 style="margin-bottom:1rem">{{ 'Project' | t }}</h2>
          <div class="form-grid">
            <div>
              <label class="lbl" for="name">{{ 'System name' | t }}</label>
              <input id="name" type="text" [(ngModel)]="d.name" name="name" [placeholder]="'e.g. School Management' | t" />
            </div>
            <div>
              <label class="lbl" for="db">{{ 'Database' | t }}</label>
              <select id="db" [(ngModel)]="d.database" name="db">
                <option value="Sqlite">{{ 'SQLite — easiest, single file' | t }}</option>
                <option value="SqlServer">Microsoft SQL Server</option>
                <option value="PostgreSql">PostgreSQL</option>
                <option value="MySql" disabled>{{ 'MySQL — coming soon' | t }}</option>
                <option value="Oracle" disabled>{{ 'Oracle — coming soon' | t }}</option>
              </select>
            </div>
          </div>

          <h3 style="margin:1.5rem 0 .75rem; font-size:.95rem">{{ 'What to generate' | t }}</h3>
          <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">
            <div class="tile on locked">
              <span class="ico"><app-icon name="code" /></span>
              <div><div class="t">{{ 'Web API + Swagger' | t }}</div><div class="muted small">{{ 'C# ASP.NET Core, login and roles. Always included.' | t }}</div></div>
              <span class="switch"></span>
            </div>
            <div class="tile" [class.on]="has('WebApp')" (click)="toggle('WebApp')" role="switch" [attr.aria-checked]="has('WebApp')" tabindex="0" (keydown.enter)="toggle('WebApp')" (keydown.space)="toggle('WebApp')">
              <span class="ico"><app-icon name="globe" /></span>
              <div><div class="t">{{ 'Angular web app' | t }}</div><div class="muted small">{{ 'Modern admin UI with dark mode, ready to deploy.' | t }}</div></div>
              <span class="switch"></span>
            </div>
            <div class="tile" [class.on]="d.accessControl" (click)="toggleAccess()" role="switch" [attr.aria-checked]="d.accessControl" tabindex="0" (keydown.enter)="toggleAccess()" (keydown.space)="toggleAccess()">
              <span class="ico"><app-icon name="shield" /></span>
              <div><div class="t">{{ 'Access control' | t }}</div><div class="muted small">{{ 'Modules (menu), sub-modules (submenu), permissions and roles, managed by admins and enforced by the API.' | t }}</div></div>
              <span class="switch"></span>
            </div>
            <div class="tile" [class.on]="d.dynamicMenu || d.accessControl" [class.locked]="d.accessControl" (click)="toggleMenu()" role="switch" [attr.aria-checked]="d.dynamicMenu || d.accessControl" tabindex="0" (keydown.enter)="toggleMenu()" (keydown.space)="toggleMenu()">
              <span class="ico"><app-icon name="list" /></span>
              <div><div class="t">{{ 'Dynamic menu' | t }}</div><div class="muted small">{{ (d.accessControl ? 'Included: the menu comes from the modules.' : 'Menu stored in a database table; admins edit it without redeploying.') | t }}</div></div>
              <span class="switch"></span>
            </div>
            <div class="tile" [class.on]="has('Docker')" (click)="toggle('Docker')" role="switch" [attr.aria-checked]="has('Docker')" tabindex="0" (keydown.enter)="toggle('Docker')" (keydown.space)="toggle('Docker')">
              <span class="ico"><app-icon name="box" /></span>
              <div><div class="t">{{ 'Docker files' | t }}</div><div class="muted small">{{ 'Dockerfile and docker-compose for the whole stack.' | t }}</div></div>
              <span class="switch"></span>
            </div>
            <div class="tile locked" style="opacity:.55">
              <span class="ico"><app-icon name="smartphone" /></span>
              <div><div class="t">{{ 'Flutter mobile app' | t }}</div><div class="muted small">{{ 'Coming soon.' | t }}</div></div>
              <span class="badge">{{ 'Soon' | t }}</span>
            </div>
          </div>
          @if (d.accessControl) {
            <p class="hint" style="margin-top:.75rem"><app-icon name="check" [size]="12" />
              {{ (has('WebApp')
                ? 'Database tables for modules, sub-modules, permissions, role menus and role permissions are created, and the Role table gets Type and Level. Every entity gets View / Create / Edit / Delete permissions that the API enforces, and the web app gets Administration screens for modules, sub-modules, roles, users and bulk permissions.'
                : 'Database tables for modules, sub-modules, permissions, role menus and role permissions are created, and the Role table gets Type and Level. Every entity gets View / Create / Edit / Delete permissions that the API enforces. Turn on the Angular web app to get the Administration screens.') | t }}</p>
          } @else if (d.dynamicMenu) {
            <p class="hint" style="margin-top:.75rem"><app-icon name="check" [size]="12" />
              {{ (has('WebApp')
                ? 'A menu table and the menu endpoints will be created, and the web app gets a Menu editor for admins.'
                : 'A menu table and the menu endpoints will be created. Turn on the Angular web app to get the editor screen.') | t }}</p>
          }
        </div>

        <div class="row" style="margin:1.75rem 0 .75rem">
          <h2>{{ 'Entities' | t }} <span class="muted small" style="font-weight:400">{{ 'each becomes a table, an API and a screen' | t }}</span></h2>
          <span class="spacer"></span>
          <button class="btn primary" (click)="addEntity()"><app-icon name="plus" [size]="16" /> {{ 'Add entity' | t }}</button>
        </div>

        @for (e of d.entities; track e) {
          <div class="card" style="margin-bottom:1rem">
            <div class="entity-head" style="margin-bottom:.9rem">
              <span class="chip" style="display:inline-grid;place-items:center;width:34px;height:34px;padding:0"><app-icon name="table" [size]="18" /></span>
              <input type="text" [value]="e.name" placeholder="EntityName" (input)="rename(e, $any($event.target).value)" style="width:220px; font-weight:650" [attr.aria-label]="'Entity name' | t" />
              <span class="muted small">{{ 'API:' | t }} <code>/api/{{ route(e) }}</code></span>
              <span class="spacer"></span>
              <span class="badge">{{ '{0} fields' | t: [(e.fields.length)] }}</span>
              <button class="btn icon ghost danger" (click)="removeEntity(e)" [attr.aria-label]="'Remove entity' | t"><app-icon name="trash" [size]="16" /></button>
            </div>

            <div class="field-row field-head"><span>{{ 'Field' | t }}</span><span>{{ 'Type' | t }}</span><span>{{ 'Max length' | t }}</span><span>{{ 'Required' | t }}</span><span>{{ 'Unique' | t }}</span><span></span></div>
            @for (f of e.fields; track f) {
              <div class="field-row">
                <input type="text" [(ngModel)]="f.name" name="fname" placeholder="FieldName" [attr.aria-label]="'Field name' | t" />
                <select [(ngModel)]="f.type" name="ftype" [attr.aria-label]="'Field type' | t">
                  @for (t of fieldTypes; track t) { <option [value]="t">{{ t }}</option> }
                </select>
                <input type="number" min="1" [(ngModel)]="f.maxLength" name="fmax" placeholder="—" [attr.aria-label]="'Max length' | t" />
                <label class="row small" style="gap:.35rem"><input type="checkbox" [(ngModel)]="f.required" name="freq" /> {{ 'Req.' | t }}</label>
                <label class="row small" style="gap:.35rem"><input type="checkbox" [(ngModel)]="f.unique" name="funi" /> {{ 'Uniq.' | t }}</label>
                <button class="btn icon ghost danger" (click)="removeField(e, f)" [attr.aria-label]="'Remove field' | t"><app-icon name="x" [size]="16" /></button>
              </div>
            }
            <button class="btn" style="margin-top:.5rem" (click)="addField(e)"><app-icon name="plus" [size]="15" /> {{ 'Field' | t }}</button>

            <h3 style="margin:1.25rem 0 .5rem; font-size:.9rem">{{ 'Links to other entities' | t }}</h3>
            @for (r of e.relations; track r) {
              <div class="row" style="margin-bottom:.4rem">
                <input type="text" [(ngModel)]="r.name" name="rname" style="width:180px" [attr.aria-label]="'Link name' | t" />
                <app-icon name="chevron-right" [size]="16" />
                <select [(ngModel)]="r.targetEntity" name="rtarget" style="width:200px" [attr.aria-label]="'Linked entity' | t">
                  <option value="">{{ '(choose)' | t }}</option>
                  @for (o of entityNames(); track o) { <option [value]="o">{{ o }}</option> }
                </select>
                <label class="row small" style="gap:.35rem"><input type="checkbox" [(ngModel)]="r.required" name="rreq" /> {{ 'required' | t }}</label>
                <button class="btn icon ghost danger" (click)="removeRelation(e, r)" [attr.aria-label]="'Remove link' | t"><app-icon name="x" [size]="16" /></button>
              </div>
            }
            <button class="btn" (click)="addRelation(e)"><app-icon name="plus" [size]="15" /> {{ 'Link' | t }}</button>
          </div>
        }

        @if (d.entities.length === 0) {
          <div class="card empty">
            <div class="ico"><app-icon name="table" [size]="26" /></div>
            <h3>{{ 'No entities yet' | t }}</h3>
            <p>{{ 'An entity is something you keep records of, such as Student, Product or Invoice.' | t }}</p>
            <button class="btn primary" (click)="addEntity()"><app-icon name="plus" [size]="16" /> {{ 'Add your first entity' | t }}</button>
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
      d.accessControl = d.accessControl === true;
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
    if (d.accessControl) return; // included in access control
    d.dynamicMenu = !d.dynamicMenu;
    this.changed();
  }

  protected toggleAccess() {
    const d = this.def()!;
    d.accessControl = !d.accessControl;
    if (d.accessControl) d.dynamicMenu = false; // the module menu replaces the simple dynamic menu
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
    const ok = await this.confirm.ask('“{0}” and links pointing to it will be removed from the design.',
      { params: [e.name], title: 'Remove entity?', confirmText: 'Remove', danger: true });
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
