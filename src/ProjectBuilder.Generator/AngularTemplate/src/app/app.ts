import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { APP_NAME, ENTITIES } from './entities';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (auth.isLoggedIn()) {
      <div class="shell">
        <aside>
          <a routerLink="/" class="brand">{{ appName }}</a>
          <nav>
            @for (e of entities; track e.name) {
              <a [routerLink]="['/e', e.route]" routerLinkActive="active">{{ e.plural }}</a>
            }
          </nav>
          <div class="user">
            <div class="muted">{{ auth.email() }}</div>
            <button class="btn" (click)="logout()">Log out</button>
          </div>
        </aside>
        <main><router-outlet /></main>
      </div>
    } @else {
      <router-outlet />
    }
  `,
  styles: `
    .shell { display: flex; min-height: 100vh; }
    aside { width: 230px; background: #111827; color: #e5e7eb; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
    .brand { color: #fff; font-weight: 700; font-size: 1.1rem; }
    nav { display: flex; flex-direction: column; gap: .15rem; flex: 1; overflow: auto; }
    nav a { color: #cbd5e1; padding: .45rem .6rem; border-radius: 6px; }
    nav a:hover { background: #1f2937; }
    nav a.active { background: var(--primary); color: #fff; }
    .user { font-size: .8rem; display: flex; flex-direction: column; gap: .5rem; word-break: break-all; }
    main { flex: 1; padding: 1.5rem; min-width: 0; }
  `
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly appName = APP_NAME;
  protected readonly entities = ENTITIES;

  protected logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
