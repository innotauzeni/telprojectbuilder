import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/** The Studio session. The server keeps it in an HttpOnly cookie, so no token is ever visible to scripts. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  /** undefined = not checked yet, null = signed out, otherwise the signed-in email. */
  readonly email = signal<string | null | undefined>(undefined);

  /** Asks the server who is signed in (runs once before the app starts). */
  async init(): Promise<void> {
    try {
      const me = await firstValueFrom(this.http.get<{ email: string }>('/api/account/me'));
      this.email.set(me.email);
    } catch {
      this.email.set(null);
    }
  }

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(this.http.post<{ email: string }>('/api/account/login', { email, password }));
    this.email.set(res.email);
  }

  async register(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(this.http.post<{ email: string }>('/api/account/register', { email, password }));
    this.email.set(res.email);
  }

  async logout(): Promise<void> {
    try { await firstValueFrom(this.http.post('/api/account/logout', {})); } catch { /* already signed out */ }
    this.email.set(null);
  }

  /** Called by the interceptor when the server says the session is gone. */
  expired() { this.email.set(null); }
}
