import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { StudioApi } from '../studio-api';
import { AppDef, GeneratedFile, hasTarget } from '../models';
import { Icon } from '../ui/icon';
import { T } from '../ui/t.pipe';

type Tab = 'web' | 'api' | 'code';
type Device = 'desktop' | 'tablet' | 'mobile';

@Component({
  selector: 'app-preview',
  imports: [RouterLink, Icon, T],
  template: `
    <div class="row" style="margin-bottom:1.25rem">
      <a [routerLink]="['/designer', id()]" class="btn ghost"><app-icon name="chevron-left" [size]="16" /> {{ 'Back to designer' | t }}</a>
      <div style="display:flex;flex-direction:column">
        <span class="crumbs">{{ 'Preview' | t }}</span>
        <h1 style="font-size:1.35rem">{{ def()?.name }}</h1>
      </div>
      <span class="spacer"></span>
      @if (files()) {
        <a class="btn primary" [href]="'/download/' + id()" download><app-icon name="download" [size]="16" /> {{ 'Download project' | t }}</a>
      }
    </div>

    @if (errors().length > 0) {
      <div class="alert error" role="alert" style="flex-direction:column">
        <strong>{{ 'Fix these in the designer to see the preview' | t }}</strong>
        <ul style="margin:.25rem 0 0; padding-left:1.2rem">@for (e of errors(); track $index) { <li>{{ e | t }}</li> }</ul>
      </div>
    } @else if (files(); as list) {
      <div class="row" style="margin-bottom:1rem">
        <div class="seg" role="tablist">
          @if (hasWeb()) {
            <button role="tab" [class.active]="tab() === 'web'" (click)="tab.set('web')"><app-icon name="globe" [size]="16" /> {{ 'Web app' | t }}</button>
          }
          <button role="tab" [class.active]="tab() === 'api'" (click)="tab.set('api')"><app-icon name="code" [size]="16" /> {{ 'API (Swagger)' | t }}</button>
          <button role="tab" [class.active]="tab() === 'code'" (click)="tab.set('code')"><app-icon name="file" [size]="16" /> {{ 'Files ({0})' | t: [(list.length)] }}</button>
        </div>
        <span class="spacer"></span>
        @if (tab() === 'web') {
          <div class="seg" [attr.aria-label]="'Preview size' | t">
            <button [class.active]="device() === 'desktop'" (click)="device.set('desktop')" [attr.aria-label]="'Desktop' | t"><app-icon name="monitor" [size]="16" /></button>
            <button [class.active]="device() === 'tablet'" (click)="device.set('tablet')" [attr.aria-label]="'Tablet' | t"><app-icon name="tablet" [size]="16" /></button>
            <button [class.active]="device() === 'mobile'" (click)="device.set('mobile')" [attr.aria-label]="'Phone' | t"><app-icon name="smartphone" [size]="16" /></button>
          </div>
        }
      </div>

      @switch (tab()) {
        @case ('web') {
          <div class="alert info"><app-icon name="sparkles" />
            <span>{{ (def()?.accessControl
                ? 'This is your real web app running against a temporary demo API: add, edit and delete records and try the menu and the Administration screens (modules, sub-modules, roles, users and permissions). Nothing here is saved to the download.'
                : def()?.dynamicMenu
                  ? 'This is your real web app running against a temporary demo API: add, edit and delete records and try the menu, including the Admin Menu editor. Nothing here is saved to the download.'
                  : 'This is your real web app running against a temporary demo API: add, edit and delete records and try the menu. Nothing here is saved to the download.') | t }}</span></div>
          <div class="browser" [style.max-width]="width()">
            <div class="bar">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              <span class="url">{{ appUrl() }}</span>
            </div>
            <iframe [src]="webUrl()" [title]="'Web app preview' | t" style="width:100%; height:72vh; border:0; background:#fff; display:block"></iframe>
          </div>
        }
        @case ('api') {
          <div class="alert info"><app-icon name="sparkles" />
            <span>{{ 'A live preview of the API your system will have. Use Try it out to add and list records. The downloaded API also requires login (JWT, Admin/User roles); this preview skips that so you can explore freely. Needs internet to load Swagger UI.' | t }}</span></div>
          <iframe [src]="swaggerUrl()" [title]="'API preview' | t"
                  style="width:100%; height:72vh; border:1px solid var(--border); border-radius:12px; background:#fff"></iframe>
        }
        @default {
          <div style="display:grid; grid-template-columns: 300px 1fr; gap:1rem" class="code-layout">
            <div class="card" style="padding:.5rem; max-height:72vh; overflow:auto">
              @for (f of list; track f.path) {
                <button class="btn ghost small" style="display:block; width:100%; text-align:left; font-weight:450; font-family:ui-monospace,Consolas,monospace; font-size:.78rem; margin-bottom:1px"
                        [style.background]="f === selected() ? 'var(--primary-soft)' : ''" (click)="selected.set(f)">{{ f.path }}</button>
              }
            </div>
            <pre class="card small" style="overflow:auto; max-height:72vh; margin:0; background:var(--surface-2); font-family:ui-monospace,Consolas,monospace">{{ selected()?.content }}</pre>
          </div>
        }
      }
    } @else {
      <div class="card"><div class="skeleton" style="height:1.4rem;width:30%;margin-bottom:1rem"></div><div class="skeleton" style="height:12rem"></div></div>
    }
  `
})
export class PreviewPage {
  readonly id = input.required<string>();

  private readonly api = inject(StudioApi);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly def = signal<AppDef | null>(null);
  protected readonly files = signal<GeneratedFile[] | null>(null);
  protected readonly errors = signal<string[]>([]);
  protected readonly selected = signal<GeneratedFile | null>(null);
  protected readonly tab = signal<Tab>('api');
  protected readonly device = signal<Device>('desktop');

  protected readonly hasWeb = computed(() => !!this.def() && hasTarget(this.def()!, 'WebApp'));
  protected readonly width = computed(() => ({ desktop: '100%', tablet: '820px', mobile: '390px' })[this.device()]);
  protected readonly appUrl = computed(() => `${location.host}/preview/${this.id()}/app/`);

  // The id is a GUID route parameter; URLs below are built from it only.
  protected readonly webUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(`/preview/${encodeURIComponent(this.id())}/app/`));
  protected readonly swaggerUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(`/preview/${encodeURIComponent(this.id())}/swagger`));

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  private async load(id: string) {
    this.files.set(null);
    this.errors.set([]);
    try {
      const d = await this.api.get(id);
      this.def.set(d);
      // Show both: the web app first when the project has one, with the API one click away.
      this.tab.set(hasTarget(d, 'WebApp') ? 'web' : 'api');
      const list = await this.api.files(id);
      this.files.set(list);
      this.selected.set(list.find((f) => f.path.startsWith('api/Controllers/')) ?? list[0] ?? null);
    } catch (e) {
      this.errors.set(StudioApi.errors(e));
    }
  }
}
