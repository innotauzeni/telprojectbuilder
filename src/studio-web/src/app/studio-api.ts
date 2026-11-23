import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppDef, GeneratedFile, ProjectSummary, TemplateInfo } from './models';

@Injectable({ providedIn: 'root' })
export class StudioApi {
  private readonly http = inject(HttpClient);

  templates() { return firstValueFrom(this.http.get<TemplateInfo[]>('/api/templates')); }
  projects() { return firstValueFrom(this.http.get<ProjectSummary[]>('/api/projects')); }
  create(templateKey: string | null) {
    return firstValueFrom(this.http.post<{ id: string }>('/api/projects', { templateKey }));
  }
  get(id: string) { return firstValueFrom(this.http.get<AppDef>(`/api/projects/${id}`)); }
  save(id: string, def: AppDef) { return firstValueFrom(this.http.put<void>(`/api/projects/${id}`, def)); }
  remove(id: string) { return firstValueFrom(this.http.delete<void>(`/api/projects/${id}`)); }
  validate(def: AppDef) {
    return firstValueFrom(this.http.post<{ errors: string[] }>('/api/validate', def));
  }
  files(id: string) { return firstValueFrom(this.http.get<GeneratedFile[]>(`/api/projects/${id}/files`)); }

  /** Server errors come back as { errors: [...] }; turn any failure into a short readable list. */
  static errors(err: unknown): string[] {
    if (err instanceof HttpErrorResponse) {
      if (Array.isArray(err.error?.errors)) return err.error.errors as string[];
      if (err.status === 0) return ['Cannot reach the Studio server.'];
      return [`Request failed (${err.status}).`];
    }
    return ['Something went wrong.'];
  }
}
