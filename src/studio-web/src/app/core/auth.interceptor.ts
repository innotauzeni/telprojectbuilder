import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Adds the header the server requires on state-changing calls (CSRF defence for cookie sessions)
 * and sends people to the sign-in page when their session has ended.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isApi = req.url.startsWith('/api/');
  const request = isApi ? req.clone({ setHeaders: { 'X-Requested-With': 'ProjectBuilder' } }) : req;

  return next(request).pipe(
    catchError((err: unknown) => {
      const accountCall = req.url.startsWith('/api/account/');
      if (err instanceof HttpErrorResponse && err.status === 401 && isApi && !accountCall) {
        auth.expired();
        router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => err);
    })
  );
};
