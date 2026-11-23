import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  apiBaseUrl = '/api';

  /** Reads /config.json. Edit that file after deploying to point the UI at a different API address. */
  async load(): Promise<void> {
    try {
      const res = await fetch('config.json', { cache: 'no-store' });
      if (res.ok) {
        const cfg = await res.json();
        if (typeof cfg.apiBaseUrl === 'string') this.apiBaseUrl = cfg.apiBaseUrl.replace(/\/+$/, '');
      }
    } catch {
      /* keep default */
    }
  }
}
