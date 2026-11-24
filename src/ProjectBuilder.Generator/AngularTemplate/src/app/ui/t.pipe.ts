import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '../core/i18n.service';

/**
 * {{ 'Save' | t }} or {{ 'Page {0} of {1}' | t: [page, pages] }}.
 * Impure on purpose: it reads the current language, so text updates the moment the language changes.
 */
@Pipe({ name: 't', pure: false })
export class T implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(text: string | null | undefined, params?: readonly unknown[] | Record<string, unknown>): string {
    return text ? this.i18n.t(text, params) : '';
  }
}
