import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  apiBaseUrl = '/api';
  /** True only inside the ProjectBuilder Studio preview: skips login and talks to a throwaway mock API. */
  preview = false;

  /** Reads config.json. Edit that file after deploying to point the UI at a different API address. */
  async load(): Promise<void> {
    try {
      const res = await fetch('config.json', { cache: 'no-store' });
      if (res.ok) {
        const cfg = await res.json();
        if (typeof cfg.apiBaseUrl === 'string') this.apiBaseUrl = cfg.apiBaseUrl.replace(/\/+$/, '');
        this.preview = cfg.preview === true;
      }
    } catch {
      /* keep defaults */
    }
  }
}
