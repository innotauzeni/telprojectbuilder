import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../core/auth.service';
import { Icon } from '../ui/icon';

/** Sign in / create account (one page, two modes chosen by the route). */
@Component({
  selector: 'app-account',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="split">
      <section class="brand-panel">
        <span class="logo"><app-icon name="layers" [size]="26" /></span>
        <h1>ProjectBuilder Studio</h1>
        <p>Design a complete system, preview it live and download the code. It is all yours.</p>
        <ul>
          <li><app-icon name="check" /> C# Web API, Angular web app and Docker files</li>
          <li><app-icon name="check" /> Your projects stay private to your account</li>
          <li><app-icon name="check" /> Open source, with no lock-in</li>
        </ul>
      </section>

      <section class="form-panel">
        <form class="card" (ngSubmit)="submit()" autocomplete="on">
          <h2>{{ isRegister() ? 'Create your account' : 'Welcome back' }}</h2>
          <p class="muted" style="margin:.25rem 0 1.25rem">
            {{ isRegister() ? 'It takes a few seconds.' : 'Sign in to open your projects.' }}
          </p>

          @if (errors().length) {
            <div class="alert error" role="alert" style="flex-direction:column; gap:.2rem">
              @for (e of errors(); track $index) { <span>{{ e }}</span> }
            </div>
          }

          <div style="margin-bottom:1rem">
            <label class="lbl" for="email">Email</label>
            <input id="email" type="email" name="email" [(ngModel)]="email" required autocomplete="username" placeholder="you@company.com" />
          </div>
          <div style="margin-bottom:1.25rem">
            <label class="lbl" for="password">Password</label>
            <input id="password" type="password" name="password" [(ngModel)]="password" required
                   [autocomplete]="isRegister() ? 'new-password' : 'current-password'" />
            @if (isRegister()) {
              <div class="hint">At least 8 characters with upper and lower case letters, a number and a symbol.</div>
            }
          </div>

          <button class="btn primary" type="submit" [disabled]="busy()" style="width:100%">
            {{ busy() ? 'Please wait…' : (isRegister() ? 'Create account' : 'Sign in') }}
          </button>

          <p class="small muted" style="text-align:center; margin:1.1rem 0 0">
            @if (isRegister()) { Already have an account? <a routerLink="/login" [queryParams]="keep()">Sign in</a> }
            @else { New here? <a routerLink="/register" [queryParams]="keep()">Create an account</a> }
          </p>
        </form>
      </section>
    </div>
  `,
  styles: `
    .split { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 1fr; margin: -1.75rem -1.5rem -3rem; }
    .brand-panel { background: linear-gradient(145deg, #1e1b4b, #4f46e5 60%, #7c3aed); color: #fff; padding: 3rem; display: flex; flex-direction: column; justify-content: center; gap: 1rem; }
    .logo { width: 56px; height: 56px; border-radius: 16px; background: rgba(255,255,255,.18); display: grid; place-items: center; }
    .brand-panel h1 { font-size: 2.1rem; }
    .brand-panel p { opacity: .85; margin: 0; max-width: 40ch; }
    .brand-panel ul { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: .6rem; }
    .brand-panel li { display: flex; align-items: center; gap: .6rem; }
    .form-panel { display: grid; place-items: center; padding: 1.5rem; background: var(--bg); }
    form { width: 100%; max-width: 400px; padding: 1.75rem; }
    @media (max-width: 860px) { .split { grid-template-columns: 1fr; } .brand-panel { display: none; } }
  `
})
export class AccountPage {
  /** 'login' or 'register', from the route data. */
  readonly mode = input<'login' | 'register'>('login');

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected email = '';
  protected password = '';
  protected readonly errors = signal<string[]>([]);
  protected readonly busy = signal(false);

  protected isRegister() { return this.mode() === 'register'; }

  /** Keeps ?returnUrl when switching between the two pages. */
  protected keep() {
    const r = this.route.snapshot.queryParamMap.get('returnUrl');
    return r ? { returnUrl: r } : {};
  }

  protected async submit() {
    this.errors.set([]);
    this.busy.set(true);
    try {
      if (this.isRegister()) await this.auth.register(this.email, this.password);
      else await this.auth.login(this.email, this.password);

      const target = this.route.snapshot.queryParamMap.get('returnUrl');
      // Only follow in-app paths (never an address on another site).
      await this.router.navigateByUrl(target && target.startsWith('/') && !target.startsWith('//') ? target : '/');
    } catch (e) {
      this.errors.set(e instanceof HttpErrorResponse && Array.isArray(e.error?.errors) ? e.error.errors : ['Something went wrong. Please try again.']);
    } finally {
      this.busy.set(false);
    }
  }
}
