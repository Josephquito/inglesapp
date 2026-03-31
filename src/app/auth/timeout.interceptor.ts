import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable, timeout, TimeoutError } from 'rxjs';
import { catchError, throwError } from 'rxjs';

const DEFAULT_TIMEOUT = 15_000; // 15s para el resto
const LOGIN_TIMEOUT = 70_000; // 70s para login (Render tarda ~50s en despertar)

@Injectable()
export class TimeoutInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const isLogin = req.url.includes('/auth/login');
    const ms = isLogin ? LOGIN_TIMEOUT : DEFAULT_TIMEOUT;

    return next.handle(req).pipe(
      timeout(ms),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          const msg = isLogin
            ? 'El servidor está iniciando, por favor espera un momento e intenta nuevamente.'
            : 'El servidor tardó demasiado en responder, intenta nuevamente.';
          return throwError(() => ({ timeout: true, message: msg }));
        }
        return throwError(() => err);
      }),
    );
  }
}
