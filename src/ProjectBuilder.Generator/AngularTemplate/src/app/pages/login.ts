import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { Icon } from '../ui/icon';
import { T } from '../ui/t.pipe';
import { LanguageSwitcher } from '../ui/language-switcher';

@Component({
  selector: 'app-login',
  imports: [FormsModule, Icon, T, LanguageSwitcher],
  template: `
    <div class="split">
      <section class="brand-panel">
        <div class="logo">{{ initials() }}</div>
        <h1>{{ meta.appName() }}</h1>
        <p>{{ 'Sign in to manage your data securely.' | t }}</p>
        <ul>
          <li><app-icon name="check" /> {{ 'Secure sign-in with roles' | t }}</li>
          <li><app-icon name="check" /> {{ 'Works on desktop, tablet and phone' | t }}</li>
          <li><app-icon name="check" /> {{ 'Light and dark mode' | t }}</li>
        </ul>
      </section>
      <section class="form-panel">
        <div class="lang-corner"><app-language-switcher /></div>
        <form class="card" (ngSubmit)="submit()">
          <h2>{{ 'Welcome back' | t }}</h2>
          <p class="muted" style="margin:.25rem 0 1.25rem">{{ 'Enter your email and password to continue.' | t }}</p>
          @if (error()) { <div class="alert error" role="alert"><app-icon name="alert" />{{ error() | t }}</div> }
          <div style="margin-bottom:1rem">
            <label class="lbl" for="email">{{ 'Email' | t }}</label>
            <input id="email" type="email" name="email" [(ngModel)]="email" required autocomplete="username" placeholder="you@company.com" />
          </div>
          <div style="margin-bottom:1.25rem">
            <label class="lbl" for="password">{{ 'Password' | t }}</label>
            <input id="password" type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" />
          </div>
          <button class="btn primary" type="submit" [disabled]="busy()" style="width:100%">{{ (busy() ? 'Signing in…' : 'Sign in') | t }}</button>
        </form>
      </section>
    </div>
  `,
  styles: `
    .split { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 1fr; }
    .brand-panel { background: linear-gradient(145deg, #1e1b4b, #4f46e5 60%, #7c3aed); color: #fff; padding: 3rem; display: flex; flex-direction: column; justify-content: center; gap: 1rem; }
    .logo { width: 56px; height: 56px; border-radius: 16px; background: rgba(255,255,255,.18); display: grid; place-items: center; font-size: 1.3rem; font-weight: 700; }
    .brand-panel h1 { font-size: 2.1rem; }
    .brand-panel p { opacity: .85; margin: 0; }
    .brand-panel ul { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: .6rem; opacity: .95; }
    .brand-panel li { display: flex; align-items: center; gap: .6rem; }
    .lang-corner { position: absolute; top: 1rem; right: 1rem; }
    .form-panel { position: relative; display: grid; place-items: center; padding: 1.5rem; background: var(--bg); }
    form { width: 100%; max-width: 400px; padding: 1.75rem; }
    @media (max-width: 860px) { .split { grid-template-columns: 1fr; } .brand-panel { display: none; } }
  `
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly meta = inject(MetaService);
  protected email = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected initials() {
    return this.meta.appName().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'A';
  }

  protected async submit() {
    this.error.set('');
    this.busy.set(true);
    try {
      await this.auth.login(this.email, this.password);
      await this.router.navigateByUrl('/');
    } catch (e) {
      // 403 = deactivated account, 429 = temporarily locked: the server explains which. Anything else stays generic.
      this.error.set(e instanceof HttpErrorResponse && (e.status === 403 || e.status === 429) && e.error?.detail
        ? e.error.detail : 'Invalid email or password.');
    } finally {
      this.busy.set(false);
    }
  }
}
