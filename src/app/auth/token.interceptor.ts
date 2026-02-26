import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isBrowser) return next.handle(req);

    // ✅ NO meter Authorization en endpoints públicos
    const url = req.url ?? '';
    const isPublicAuth = url.includes('/auth/login');

    if (isPublicAuth) {
      return next.handle(req);
    }

    const token = localStorage.getItem('token');
    if (!token || token === 'undefined' || token === 'null') return next.handle(req);

    return next.handle(
      req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      }),
    );
  }
}
