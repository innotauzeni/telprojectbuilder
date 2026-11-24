import { Injectable, signal } from '@angular/core';

export interface Language { code: string; name: string; }
const KEY = 'lang';

/**
 * Translations. English text is the key: templates say {{ 'Save' | t }}, and a language file (public/i18n/fr.json)
 * maps "Save" to "Enregistrer". Anything without an entry is shown in English, so a partly translated language still works.
 * Languages are listed in public/i18n/languages.json; add a language by adding its JSON file and one line there. No rebuild.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly languages = signal<Language[]>([{ code: 'en', name: 'English' }]);
  readonly lang = signal('en');
  private readonly dict = signal<Record<string, string>>({});

  /** Loads the language list and the language the person used last (or their browser's, when we have it). */
  async init(): Promise<void> {
    try {
      const res = await fetch('i18n/languages.json', { cache: 'no-store' });
      if (res.ok) this.languages.set(await res.json());
    } catch { /* English only */ }
    await this.use(this.initial());
  }

  async use(code: string): Promise<void> {
    if (!this.languages().some((l) => l.code === code)) code = 'en';
    let dict: Record<string, string> = {};
    if (code !== 'en') {
      try {
        const res = await fetch(`i18n/${code}.json`, { cache: 'no-store' });
        if (res.ok) dict = await res.json();
      } catch { /* keep English */ }
    }
    this.dict.set(dict);
    this.lang.set(code);
    document.documentElement.lang = code;
    try { localStorage.setItem(KEY, code); } catch { /* storage unavailable */ }
  }

  /** Translates `text`. Placeholders {0}, {1} ... (or {name}) are filled from `params`. */
  t(text: string, params?: readonly unknown[] | Record<string, unknown>): string {
    const dict = this.dict();
    let s: string | undefined = Object.hasOwn(dict, text) ? dict[text] : undefined; // own keys only
    if (s === undefined) {
      // "View Students" is generated as action + sub-module name; translate the two parts when the whole has no entry
      const m = /^(View|Create|Edit|Delete|Export|Print|Approve|Archive) (.+)$/.exec(text);
      s = m && Object.hasOwn(dict, m[1]) ? `${dict[m[1]]} ${Object.hasOwn(dict, m[2]) ? dict[m[2]] : m[2]}` : text;
    }
    if (params) {
      const entries = Array.isArray(params) ? params.map((v, i) => [String(i), v] as const) : Object.entries(params);
      for (const [k, v] of entries) s = s.split(`{${k}}`).join(String(v ?? ''));
    }
    return s;
  }

  private initial(): string {
    const known = new Set(this.languages().map((l) => l.code));
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && known.has(saved)) return saved;
    } catch { /* ignore */ }
    for (const l of navigator.languages ?? [navigator.language]) {
      const code = l?.slice(0, 2).toLowerCase();
      if (code && known.has(code)) return code;
    }
    return 'en';
  }
}
