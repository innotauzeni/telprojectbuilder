import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { APP_NAME } from '../entities';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="wrap">
      <form class="card" (ngSubmit)="submit()">
        <h1>{{ appName }}</h1>
        <p class="muted">Sign in to continue</p>
        @if (error()) { <div class="error">{{ error() }}</div> }
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" name="email" [(ngModel)]="email" required autocomplete="username" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" />
        </div>
        <button class="btn primary" type="submit" [disabled]="busy()">Sign in</button>
      </form>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 1rem; }
    form { width: 100%; max-width: 380px; }
  `
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly appName = APP_NAME;
  protected email = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected async submit() {
    this.error.set('');
    this.busy.set(true);
    try {
      await this.auth.login(this.email, this.password);
      await this.router.navigateByUrl('/');
    } catch {
      this.error.set('Invalid email or password.');
    } finally {
      this.busy.set(false);
    }
  }
}
