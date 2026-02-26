import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, switchMap, throwError, catchError, timeout, map } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';

export type UserRole = 'ADMIN' | 'DOCENTE' | 'ESTUDIANTE';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private API = `${environment.apiUrl}/auth`;
  private isBrowser: boolean;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  login$(username: string, password: string) {
    return this.http.post<any>(`${this.API}/login`, { username, password }).pipe(
      timeout(12000),

      map((res) => {
        const token = res?.access_token;
        if (!token) {
          throw { status: 500, error: { message: 'El servidor no devolvió access_token' } };
        }
        if (this.isBrowser) localStorage.setItem('token', token);
        return token;
      }),

      // ✅ interceptor pone Authorization automáticamente
      switchMap(() => this.http.get<any>(`${this.API}/perfil`).pipe(timeout(12000))),

      map((perfil) => {
        if (this.isBrowser) localStorage.setItem('perfil', JSON.stringify(perfil));
        return perfil;
      }),

      catchError((err) => throwError(() => err)),
    );
  }

  // ✅ lo sigues pudiendo usar en inicio.page.ts
  // ✅ ya NO seteamos headers aquí: interceptor lo hace
  getPerfil() {
    const token = this.isBrowser ? localStorage.getItem('token') : null;
    if (!token) throw new Error('No autenticado');

    return firstValueFrom(this.http.get<any>(`${this.API}/perfil`).pipe(timeout(12000)));
  }

  isAuthenticated() {
    if (!this.isBrowser) return false;
    const token = localStorage.getItem('token');
    return !!token && token !== 'undefined' && token !== 'null';
  }

  getUserRole(): UserRole | null {
    if (!this.isBrowser) return null;

    // 🔥 con tu backend actual, el payload trae rol como string:
    // JwtStrategy retorna rol: user.rol?.codigo
    const tokenRole = this.getRoleFromToken();
    if (tokenRole) return tokenRole;

    const perfilRaw = localStorage.getItem('perfil');
    if (!perfilRaw) return null;

    try {
      const perfil = JSON.parse(perfilRaw);
      // ✅ tu perfil probablemente viene rol: 'ADMIN'|'DOCENTE'...
      // (ya no rol.nombre)
      const perfilRole = perfil?.rol?.nombre ?? perfil?.rol;
      return this.normalizeRole(perfilRole);
    } catch {
      return null;
    }
  }

  hasAnyRole(allowedRoles: UserRole[]): boolean {
    const role = this.getUserRole();
    if (!role) return false;
    return allowedRoles.includes(role);
  }

  logout() {
    if (!this.isBrowser) return;
    localStorage.removeItem('token');
    localStorage.removeItem('perfil');
  }

  private getRoleFromToken(): UserRole | null {
    if (!this.isBrowser) return null;

    const token = localStorage.getItem('token');
    if (!token || token === 'undefined' || token === 'null') return null;

    const parts = token.split('.');
    if (parts.length < 2) return null;

    try {
      const payload = JSON.parse(this.decodeBase64Url(parts[1]));
      return this.normalizeRole(payload?.rol);
    } catch {
      return null;
    }
  }

  private normalizeRole(value: unknown): UserRole | null {
    if (typeof value !== 'string') return null;

    if (value === 'ADMIN' || value === 'DOCENTE' || value === 'ESTUDIANTE') {
      return value;
    }

    return null;
  }

  private decodeBase64Url(value: string): string {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return atob(padded);
  }
}
