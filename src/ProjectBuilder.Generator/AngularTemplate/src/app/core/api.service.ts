import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';

export type Row = Record<string, any>;
export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);

  private url(route: string, id?: string): string {
    return `${this.config.apiBaseUrl}/${route}` + (id ? `/${id}` : '');
  }

  list(route: string, page = 1, pageSize = 20): Observable<Paged<Row>> {
    return this.http.get<Paged<Row>>(this.url(route), { params: { page, pageSize } });
  }
  get(route: string, id: string): Observable<Row> { return this.http.get<Row>(this.url(route, id)); }
  create(route: string, body: Row): Observable<Row> { return this.http.post<Row>(this.url(route), body); }
  update(route: string, id: string, body: Row): Observable<void> { return this.http.put<void>(this.url(route, id), body); }
  remove(route: string, id: string): Observable<void> { return this.http.delete<void>(this.url(route, id)); }

  /** Turns an API error (validation problem, conflict, ...) into a readable message. */
  static message(err: unknown): string {
    if (!(err instanceof HttpErrorResponse)) return 'Something went wrong.';
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 403) return 'You do not have permission to do that (Admin role required).';
    const body = err.error;
    if (body?.errors && typeof body.errors === 'object') {
      return Object.values(body.errors as Record<string, string[]>).flat().join(' ');
    }
    return body?.detail || body?.title || `Request failed (${err.status}).`;
  }
}
