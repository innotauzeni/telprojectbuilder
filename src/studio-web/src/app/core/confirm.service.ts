import { Injectable, inject, signal } from '@angular/core';
import { I18nService } from './i18n.service';

export interface ConfirmRequest { title: string; message: string; confirmText: string; danger: boolean; resolve: (ok: boolean) => void; }

export interface ConfirmOptions {
  title?: string; confirmText?: string; danger?: boolean;
  /** Values for {0}, {1} ... in the message and in the title. */
  params?: readonly unknown[];
  titleParams?: readonly unknown[];
}

/** Replaces window.confirm with a proper dialog (rendered once by the app shell). Texts are translated here. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly i18n = inject(I18nService);
  readonly current = signal<ConfirmRequest | null>(null);

  ask(message: string, options: ConfirmOptions = {}): Promise<boolean> {
    return new Promise((resolve) =>
      this.current.set({
        title: this.i18n.t(options.title ?? 'Are you sure?', options.titleParams),
        message: this.i18n.t(message, options.params),
        confirmText: this.i18n.t(options.confirmText ?? 'Confirm'),
        danger: options.danger ?? false,
        resolve
      }));
  }

  answer(ok: boolean) {
    this.current()?.resolve(ok);
    this.current.set(null);
  }
}
