import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';

interface LoginResponse { token: string; expiresUtc: string; email: string; roles: string[]; }
const KEY = 'session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private readonly session = signal<LoginResponse | null>(this.restore());

  readonly isLoggedIn = computed(() => {
    if (this.config.preview) return true; // Studio preview: no login
    const s = this.session();
    return !!s && new Date(s.expiresUtc).getTime() > Date.now();
  });
  readonly isAdmin = computed(() => this.config.preview || (this.isLoggedIn() && !!this.session()?.roles.includes('Admin')));
  readonly email = computed(() => (this.config.preview ? 'preview@example.com' : this.session()?.email ?? ''));
  readonly role = computed(() => (this.isAdmin() ? 'Admin' : 'User'));
  readonly token = computed(() => (this.isLoggedIn() && !this.config.preview ? this.session()!.token : null));

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${this.config.apiBaseUrl}/auth/login`, { email, password })
    );
    this.session.set(res);
    try { localStorage.setItem(KEY, JSON.stringify(res)); } catch { /* storage unavailable */ }
  }

  logout(): void {
    this.session.set(null);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }

  private restore(): LoginResponse | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as LoginResponse) : null;
    } catch {
      return null;
    }
  }
}
