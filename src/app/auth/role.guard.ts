import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { AuthService, UserRole } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {
  private isBrowser: boolean;

  constructor(
    private auth: AuthService,
    private router: Router,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    if (!this.isBrowser) return true;
    if (!this.auth.isAuthenticated()) return this.router.parseUrl('/login');

    const roles = (route.data?.['roles'] as UserRole[] | undefined) ?? [];
    if (!roles.length) return true;

    return this.auth.hasAnyRole(roles) ? true : this.router.parseUrl('/inicio');
  }
}
