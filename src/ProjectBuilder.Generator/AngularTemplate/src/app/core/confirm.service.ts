import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest { title: string; message: string; confirmText: string; danger: boolean; resolve: (ok: boolean) => void; }

/** Replaces window.confirm with a proper dialog (rendered once by the app shell). */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<ConfirmRequest | null>(null);

  ask(message: string, options: { title?: string; confirmText?: string; danger?: boolean } = {}): Promise<boolean> {
    return new Promise((resolve) =>
      this.current.set({
        title: options.title ?? 'Are you sure?',
        message,
        confirmText: options.confirmText ?? 'Confirm',
        danger: options.danger ?? false,
        resolve
      }));
  }

  answer(ok: boolean) {
    this.current()?.resolve(ok);
    this.current.set(null);
  }
}
