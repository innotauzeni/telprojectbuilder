import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { I18nService } from './core/i18n.service';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Find out who is signed in before the first page is shown, so guarded pages decide correctly.
    provideAppInitializer(async () => {
      const auth = inject(AuthService);
      const i18n = inject(I18nService);
      await i18n.init(); // language list + the language chosen last time
      await auth.init();
    })
  ]
};
