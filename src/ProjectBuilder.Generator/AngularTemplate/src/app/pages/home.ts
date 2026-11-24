import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { Icon } from '../ui/icon';
import { T } from '../ui/t.pipe';

@Component({
  selector: 'app-home',
  imports: [RouterLink, Icon, T],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="titles">
          <h1>{{ 'Dashboard' | t }}</h1>
          <span class="muted">{{ 'Welcome to {0}. Here is an overview of your data.' | t: [(meta.appName())] }}</span>
        </div>
      </div>

      @if (meta.entities().length === 0) {
        <div class="card empty"><h3>{{ 'No sections yet' | t }}</h3><p>{{ 'Add entities in ProjectBuilder to see them here.' | t }}</p></div>
      } @else {
        <div class="grid">
          @for (e of meta.entities(); track e.name) {
            <a class="card stat" [routerLink]="['/e', e.route]">
              <span class="ico"><app-icon [name]="e.icon" [size]="22" /></span>
              <span>
                @if (counts()[e.route] === undefined) { <span class="skeleton" style="display:block;width:48px;height:1.6rem"></span> }
                @else { <span class="num">{{ counts()[e.route] }}</span> }
                <span class="muted small">{{ e.plural | t }}</span>
              </span>
            </a>
          }
        </div>
      }
    </div>
  `
})
export class HomePage {
  protected readonly meta = inject(MetaService);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  protected readonly counts = signal<Record<string, number>>({});

  constructor() {
    effect(() => {
      const entities = this.meta.entities();
      if (!this.auth.isLoggedIn()) return;
      untracked(() => {
        for (const e of entities) {
          this.api.list(e.route, 1, 1).subscribe({
            next: (d) => this.counts.update((c) => ({ ...c, [e.route]: d.total })),
            error: () => this.counts.update((c) => ({ ...c, [e.route]: 0 }))
          });
        }
      });
    });
  }
}
