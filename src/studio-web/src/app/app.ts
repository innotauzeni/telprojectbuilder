import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ConfirmService } from './core/confirm.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './core/toast.service';
import { Icon } from './ui/icon';
import { T } from './ui/t.pipe';
import { LanguageSwitcher } from './ui/language-switcher';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, Icon, T, LanguageSwitcher],
  template: `
    <header>
      <div class="bar">
        <a routerLink="/" class="brand" [attr.aria-label]="'ProjectBuilder Studio home' | t">
          <span class="logo"><app-icon name="layers" [size]="18" /></span>
          <span>ProjectBuilder <b>Studio</b></span>
        </a>
        <span class="spacer"></span>
        @if (auth.email(); as email) {
          <a class="btn ghost" routerLink="/"><app-icon name="table" [size]="16" /> {{ 'Projects' | t }}</a>
          <span class="who" [title]="email"><span class="avatar">{{ email[0].toUpperCase() }}</span><span class="addr">{{ email }}</span></span>
          <button class="btn ghost" (click)="signOut()" [attr.aria-label]="'Sign out' | t"><app-icon name="log-out" [size]="16" /> {{ 'Sign out' | t }}</button>
        } @else {
          <a class="btn ghost" routerLink="/login">{{ 'Sign in' | t }}</a>
          <a class="btn primary" routerLink="/register">{{ 'Create account' | t }}</a>
        }
        <app-language-switcher />
        <button class="btn icon ghost" (click)="theme.toggle()" [attr.aria-label]="(theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode') | t">
          <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
        </button>
      </div>
    </header>
    <main><router-outlet /></main>
    <footer class="muted small">{{ 'Open source · MIT licensed · Generated systems are yours, with no lock-in.' | t }}</footer>

    <div class="toasts" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class.success]="t.kind === 'success'" [class.error]="t.kind === 'error'" role="status">
          <app-icon [name]="t.kind === 'success' ? 'check' : 'alert'" />
          <span style="flex:1">{{ t.text }}</span>
          <button class="btn icon ghost" style="width:1.6rem;height:1.6rem;padding:.2rem" (click)="toast.dismiss(t.id)" [attr.aria-label]="'Dismiss' | t"><app-icon name="x" [size]="14" /></button>
        </div>
      }
    </div>

    @if (confirm.current(); as c) {
      <div class="backdrop" (click)="confirm.answer(false)">
        <div class="dialog" role="alertdialog" aria-modal="true" [attr.aria-label]="c.title" (click)="$event.stopPropagation()">
          <h2>{{ c.title }}</h2>
          <p class="muted" style="margin:.25rem 0 1.25rem">{{ c.message }}</p>
          <div class="row" style="justify-content:flex-end">
            <button class="btn" (click)="confirm.answer(false)">{{ 'Cancel' | t }}</button>
            <button class="btn" [class.danger]="c.danger" [class.solid]="c.danger" [class.primary]="!c.danger" (click)="confirm.answer(true)">{{ c.confirmText }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 100vh; }
    header { position: sticky; top: 0; z-index: 40; background: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
    .bar { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; gap: .5rem; padding: .6rem 1.5rem; }
    .brand { display: flex; align-items: center; gap: .6rem; color: var(--text); font-weight: 500; }
    .brand b { color: var(--primary); }
    .logo { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #6366f1, #8b5cf6); }
    .who { display: inline-flex; align-items: center; gap: .5rem; font-size: .85rem; color: var(--muted); max-width: 240px; }
    .avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; font-weight: 650; flex: none; }
    .addr { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (max-width: 720px) { .addr { display: none; } }
    main { flex: 1; width: 100%; max-width: 1200px; margin: 0 auto; padding: 1.75rem 1.5rem 3rem; }
    footer { text-align: center; padding: 1.5rem; border-top: 1px solid var(--border); }
    @media (max-width: 720px) { .bar { padding: .5rem 1rem; } main { padding: 1.25rem 1rem 2.5rem; } }
  `
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);
  protected readonly toast = inject(ToastService);
  protected readonly confirm = inject(ConfirmService);

  protected async signOut() {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
