import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { StudioApi } from '../studio-api';
import { GeneratedFile } from '../models';

@Component({
  selector: 'app-preview',
  imports: [RouterLink],
  template: `
    <div class="row" style="margin-bottom:1rem">
      <a [routerLink]="['/designer', id()]" class="btn sm">← Back to designer</a>
      <h1 style="margin:0">Preview</h1>
      <span class="spacer"></span>
      @if (files()) {
        <a class="btn success" [href]="'/download/' + id()" download>Download project (.zip)</a>
      }
    </div>

    @if (errors().length > 0) {
      <div class="alert warn">
        <strong>Fix these in the designer to see the preview:</strong>
        <ul>@for (e of errors(); track $index) { <li>{{ e }}</li> }</ul>
      </div>
    } @else if (files(); as list) {
      <div class="tabs">
        <button [class.active]="tab() === 'api'" (click)="tab.set('api')">Try the API</button>
        <button [class.active]="tab() === 'code'" (click)="tab.set('code')">Generated files ({{ list.length }})</button>
      </div>

      @if (tab() === 'api') {
        <div class="alert info">
          This is a <strong>live preview</strong> of the API your system will have. Use <em>Try it out</em> to add and list records.
          Data here is temporary and is not part of the download. The downloaded API additionally requires <strong>login</strong>
          (JWT, Admin/User roles); this preview skips that so you can explore freely. Needs internet to load Swagger UI.
        </div>
        <iframe [src]="swaggerUrl()" title="API preview"
                style="width:100%; height:75vh; border:1px solid var(--border); border-radius:6px; background:#fff"></iframe>
      } @else {
        <div style="display:grid; grid-template-columns: 280px 1fr; gap:1rem">
          <div class="card" style="padding:.5rem; max-height:75vh; overflow:auto">
            @for (f of list; track f.path) {
              <button class="btn sm" style="display:block; width:100%; text-align:left; margin-bottom:2px; border:none"
                      [style.background]="f === selected() ? '#dbeafe' : 'transparent'" (click)="selected.set(f)">{{ f.path }}</button>
            }
          </div>
          <pre class="card small" style="overflow:auto; max-height:75vh; background:#f8fafc">{{ selected()?.content }}</pre>
        </div>
      }
    } @else {
      <p class="muted">Generating…</p>
    }
  `
})
export class PreviewPage {
  readonly id = input.required<string>();

  private readonly api = inject(StudioApi);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly files = signal<GeneratedFile[] | null>(null);
  protected readonly errors = signal<string[]>([]);
  protected readonly selected = signal<GeneratedFile | null>(null);
  protected readonly tab = signal<'api' | 'code'>('api');

  // The id is a GUID route parameter validated by the router/server; the URL is built from it only.
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
      const list = await this.api.files(id);
      this.files.set(list);
      this.selected.set(list.find((f) => f.path.startsWith('api/Controllers/')) ?? list[0] ?? null);
    } catch (e) {
      this.errors.set(StudioApi.errors(e));
    }
  }
}
