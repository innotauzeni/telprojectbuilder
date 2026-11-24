import { Component, inject } from '@angular/core';
import { I18nService } from '../core/i18n.service';
import { Icon } from './icon';
import { T } from './t.pipe';

/** A small language picker. The choice is remembered on this device. */
@Component({
  selector: 'app-language-switcher',
  imports: [Icon, T],
  template: `
    <label class="lang">
      <app-icon name="globe" [size]="16" />
      <select [attr.aria-label]="'Language' | t" (change)="i18n.use($any($event.target).value)">
        @for (l of i18n.languages(); track l.code) {
          <option [value]="l.code" [selected]="l.code === i18n.lang()">{{ l.name }}</option>
        }
      </select>
    </label>
  `
})
export class LanguageSwitcher {
  protected readonly i18n = inject(I18nService);
}
