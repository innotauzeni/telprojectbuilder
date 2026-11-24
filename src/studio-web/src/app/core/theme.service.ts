import { Injectable, signal } from '@angular/core';

type Theme = 'light' | 'dark';
const KEY = 'theme';

/** Light/dark mode. Follows the operating system until the user picks one. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initial());

  constructor() { this.apply(this.theme()); }

  toggle() {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    this.apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  }

  private initial(): Theme {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* ignore */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private apply(t: Theme) { document.documentElement.setAttribute('data-theme', t); }
}
