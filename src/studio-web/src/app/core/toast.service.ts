import { Injectable, inject, signal } from '@angular/core';
import { I18nService } from './i18n.service';

export interface Toast { id: number; kind: 'success' | 'error'; text: string; }

/** Short messages. Text is translated here, so callers pass English (optionally with {0} placeholders and params). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly i18n = inject(I18nService);
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  success(text: string, params?: readonly unknown[]) { this.push('success', text, params); }
  error(text: string, params?: readonly unknown[]) { this.push('error', text, params, 6000); }

  dismiss(id: number) { this.toasts.update((t) => t.filter((x) => x.id !== id)); }

  private push(kind: Toast['kind'], text: string, params?: readonly unknown[], ms = 3500) {
    const id = this.nextId++;
    this.toasts.update((t) => [...t, { id, kind, text: this.i18n.t(text, params) }]);
    setTimeout(() => this.dismiss(id), ms);
  }
}
