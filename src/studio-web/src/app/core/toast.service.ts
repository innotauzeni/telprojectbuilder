import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; kind: 'success' | 'error'; text: string; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  success(text: string) { this.push('success', text); }
  error(text: string) { this.push('error', text, 6000); }

  dismiss(id: number) { this.toasts.update((t) => t.filter((x) => x.id !== id)); }

  private push(kind: Toast['kind'], text: string, ms = 3500) {
    const id = this.nextId++;
    this.toasts.update((t) => [...t, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), ms);
  }
}
