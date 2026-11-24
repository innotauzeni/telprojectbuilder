import { ApplicationConfig, provideAppInitializer, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { ConfigService } from './core/config.service';
import { MetaService } from './core/meta.service';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Before the app starts, read config.json (API address) and entities.json (the system description),
    // so the same build works in any environment.
    provideAppInitializer(async () => {
      const config = inject(ConfigService);
      const meta = inject(MetaService);
      await config.load();
      await meta.load();
    })
  ]
};
