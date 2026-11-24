import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';
import { MetaService } from './meta.service';

interface LoginResponse { token: string; expiresUtc: string; email: string; roles: string[]; }
const KEY = 'session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private readonly meta = inject(MetaService);
  private readonly session = signal<LoginResponse | null>(this.restore());

  /** Permission names the current user's roles hold (only loaded when the system has access control). */
  readonly permissions = signal<ReadonlySet<string>>(new Set());

  readonly isLoggedIn = computed(() => {
    if (this.config.preview) return true; // Studio preview: no login
    const s = this.session();
    return !!s && new Date(s.expiresUtc).getTime() > Date.now();
  });
  readonly isAdmin = computed(() => this.config.preview || (this.isLoggedIn() && !!this.session()?.roles.includes('Admin')));
  readonly email = computed(() => (this.config.preview ? 'preview@example.com' : this.session()?.email ?? ''));
  readonly role = computed(() => (this.isAdmin() ? 'Admin' : this.session()?.roles[0] ?? 'User'));
  readonly token = computed(() => (this.isLoggedIn() && !this.config.preview ? this.session()!.token : null));

  /**
   * Whether the user may do something. With access control that is a permission such as "students.delete"
   * (Admin may do everything); without it only deleting is restricted, to Admins. The API enforces the same rules.
   */
  can(permission: string, fallbackAdminOnly = false): boolean {
    if (this.isAdmin()) return true;
    if (this.meta.accessControl()) return this.permissions().has(permission);
    return !fallbackAdminOnly;
  }

  async loadPermissions(): Promise<void> {
    if (!this.meta.accessControl()) return;
    try {
      const res = await firstValueFrom(this.http.get<{ isAdmin: boolean; codes: string[] }>(`${this.config.apiBaseUrl}/me/permissions`));
      this.permissions.set(new Set(res.codes));
    } catch {
      this.permissions.set(new Set());
    }
  }

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${this.config.apiBaseUrl}/auth/login`, { email, password })
    );
    this.session.set(res);
    try { localStorage.setItem(KEY, JSON.stringify(res)); } catch { /* storage unavailable */ }
  }

  logout(): void {
    this.session.set(null);
    this.permissions.set(new Set());
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
