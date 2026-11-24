import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ConfigService } from './core/config.service';
import { ConfirmService } from './core/confirm.service';
import { MenuService } from './core/menu.service';
import { MetaService } from './core/meta.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './core/toast.service';
import { Icon } from './ui/icon';
import { T } from './ui/t.pipe';
import { LanguageSwitcher } from './ui/language-switcher';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, T, LanguageSwitcher],
  template: `
    @if (auth.isLoggedIn()) {
      <div class="shell">
        @if (open()) { <div class="scrim" (click)="open.set(false)"></div> }
        <aside [class.open]="open()" [attr.aria-label]="'Main navigation' | t">
          <a routerLink="/" class="brand" (click)="open.set(false)">
            <span class="logo">{{ initials() }}</span>
            <span class="name">{{ meta.appName() }}</span>
          </a>
          @if (config.preview) { <span class="preview-tag">{{ 'Preview mode' | t }}</span> }
          <nav>
            @for (m of menu.items(); track m.label) {
              @if (m.children?.length) {
                <!-- a system module (menu) with its sub-modules (submenu) -->
                <button class="group" (click)="toggle(m.label)" [attr.aria-expanded]="isOpen(m.label)">
                  <app-icon [name]="m.icon || 'table'" [size]="18" />
                  <span>{{ m.label | t }}</span>
                  <app-icon class="chev" [name]="isOpen(m.label) ? 'chevron-down' : 'chevron-right'" [size]="16" />
                </button>
                @if (isOpen(m.label)) {
                  <div class="sub">
                    @for (c of m.children; track c.label + c.route) {
                      <a [routerLink]="c.route" routerLinkActive="active" (click)="open.set(false)">
                        <app-icon [name]="c.icon || 'table'" [size]="16" />
                        <span>{{ c.label | t }}</span>
                      </a>
                    }
                  </div>
                }
              } @else {
                <a [routerLink]="m.route" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: m.route === '/' }"
                   (click)="open.set(false)">
                  <app-icon [name]="m.icon || 'table'" [size]="18" />
                  <span>{{ m.label | t }}</span>
                </a>
              }
            }
          </nav>
          <div class="user">
            <div class="avatar">{{ (auth.email()[0] || '?').toUpperCase() }}</div>
            <div class="who">
              <div class="email" [title]="auth.email()">{{ auth.email() }}</div>
              <span class="role">{{ auth.role() }}</span>
            </div>
            @if (!config.preview) {
              <button class="btn icon ghost" (click)="logout()" [attr.aria-label]="'Log out' | t" [title]="'Log out' | t"><app-icon name="log-out" /></button>
            }
          </div>
        </aside>

        <div class="content">
          <header class="topbar">
            <button class="btn icon ghost menu-btn" (click)="open.set(true)" [attr.aria-label]="'Open menu' | t"><app-icon name="menu" [size]="20" /></button>
            <span class="spacer"></span>
            <app-language-switcher />
            <button class="btn icon ghost" (click)="theme.toggle()" [attr.aria-label]="(theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode') | t">
              <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
            </button>
          </header>
          <main><router-outlet /></main>
        </div>
      </div>
    } @else {
      <router-outlet />
    }

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
            <button class="btn" [class.danger]="c.danger" [class.solid]="c.danger" [class.primary]="!c.danger"
                    (click)="confirm.answer(true)">{{ c.confirmText }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .shell { display: flex; min-height: 100vh; }
    aside { width: 260px; flex: none; background: var(--sidebar); color: var(--sidebar-text); display: flex; flex-direction: column; padding: 1rem .75rem; position: sticky; top: 0; height: 100vh; z-index: 60; }
    .brand { display: flex; align-items: center; gap: .7rem; padding: .35rem .5rem 1rem; color: #fff; }
    .logo { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; font-weight: 700; color: #fff; background: linear-gradient(135deg, #6366f1, #8b5cf6); flex: none; }
    .name { font-weight: 700; font-size: 1.02rem; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; }
    .preview-tag { align-self: flex-start; margin: 0 .5rem .75rem; font-size: .7rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #fbbf24; background: rgba(251, 191, 36, .12); padding: .15rem .55rem; border-radius: 999px; }
    nav { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
    nav a { display: flex; align-items: center; gap: .7rem; padding: .6rem .75rem; border-radius: 10px; color: var(--sidebar-text); font-weight: 520; font-size: .93rem; }
    nav a:hover { background: var(--sidebar-2); color: #fff; }
    nav .group { display: flex; align-items: center; gap: .7rem; padding: .6rem .75rem; border-radius: 10px; color: var(--sidebar-text); font: inherit; font-weight: 600; font-size: .93rem; background: none; border: 0; cursor: pointer; text-align: left; width: 100%; }
    nav .group:hover { background: var(--sidebar-2); color: #fff; }
    nav .group .chev { margin-left: auto; opacity: .7; }
    nav .sub { display: flex; flex-direction: column; gap: 2px; margin: 0 0 .35rem 1.15rem; padding-left: .55rem; border-left: 1px solid var(--sidebar-2); }
    nav .sub a { padding: .45rem .7rem; font-size: .88rem; }
    nav a.active { background: var(--primary); color: var(--on-primary); }
    :host-context([data-theme='dark']) nav a.active { color: #0a0f1f; }
    .user { display: flex; align-items: center; gap: .6rem; padding: .75rem .5rem 0; border-top: 1px solid var(--sidebar-2); margin-top: .75rem; }
    .avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--sidebar-2); color: #fff; display: grid; place-items: center; font-weight: 650; flex: none; }
    .who { min-width: 0; flex: 1; }
    .email { color: #fff; font-size: .82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .role { font-size: .72rem; color: var(--sidebar-muted); }
    .user .btn { color: var(--sidebar-text); }
    .user .btn:hover { background: var(--sidebar-2); }
    .content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .topbar { display: flex; align-items: center; gap: .5rem; padding: .6rem 1.5rem; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 85%, transparent); backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 40; }
    main { padding: 1.75rem 1.5rem 3rem; flex: 1; }
    .menu-btn, .scrim { display: none; }
    @media (max-width: 900px) {
      aside { position: fixed; left: 0; top: 0; transform: translateX(-100%); transition: transform .2s; box-shadow: var(--shadow); }
      aside.open { transform: none; }
      .menu-btn { display: inline-flex; }
      .scrim { display: block; position: fixed; inset: 0; background: rgba(8, 12, 28, .5); z-index: 55; }
      main { padding: 1.25rem 1rem 3rem; }
      .topbar { padding: .5rem 1rem; }
    }
  `
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly config = inject(ConfigService);
  protected readonly meta = inject(MetaService);
  protected readonly menu = inject(MenuService);
  protected readonly theme = inject(ThemeService);
  protected readonly toast = inject(ToastService);
  protected readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  protected readonly open = signal(false);
  private readonly collapsed = signal<ReadonlySet<string>>(new Set());
  protected isOpen(label: string) { return !this.collapsed().has(label); }
  protected toggle(label: string) {
    const next = new Set(this.collapsed());
    if (next.has(label)) next.delete(label); else next.add(label);
    this.collapsed.set(next);
  }
  protected readonly initials = computed(() =>
    this.meta.appName().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'A');

  constructor() {
    // (Re)load the menu whenever someone logs in; it depends on their roles.
    effect(() => {
      if (this.auth.isLoggedIn()) untracked(() => { this.menu.load(); this.auth.loadPermissions(); });
      // Signed out: forget the previous person's menu so the next user never briefly sees it.
      else untracked(() => this.menu.items.set([]));
    });
    this.router.events.subscribe((e) => { if (e instanceof NavigationEnd) this.open.set(false); });
  }

  protected logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
