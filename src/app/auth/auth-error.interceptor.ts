import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthErrorInterceptor implements HttpInterceptor {
  private isBrowser: boolean;
  private redirecting = false;

  constructor(
    private router: Router,
    private auth: AuthService,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((err: any) => {
        if (!this.isBrowser) return throwError(() => err);

        const httpErr = err as HttpErrorResponse;
        const status = httpErr?.status ?? 0;
        const url = req.url ?? '';
        const isLogin = url.includes('/auth/login');

        if (!isLogin && (status === 401 || status === 403)) {
          if (!this.redirecting) {
            this.redirecting = true;

            this.auth.logout();

            queueMicrotask(() => {
              void this.router.navigateByUrl('/login', { replaceUrl: true });
              setTimeout(() => (this.redirecting = false), 300);
            });
          }
        }

        return throwError(() => err);
      }),
    );
  }
}
