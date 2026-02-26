import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private isBrowser: boolean;

  constructor(
    private auth: AuthService,
    private router: Router,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  canActivate(): boolean | UrlTree {
    // En SSR no intentes navegar ni leer localStorage
    if (!this.isBrowser) return true;

    if (this.auth.isAuthenticated()) return true;
    return this.router.parseUrl('/login');
  }
}
