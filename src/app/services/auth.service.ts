import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Observable, firstValueFrom, throwError } from 'rxjs';
import { catchError, map, switchMap, tap, distinctUntilChanged, filter } from 'rxjs/operators';

export type UserRole = 'ADMIN' | 'DOCENTE' | 'ESTUDIANTE';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private API = `${environment.apiUrl}/auth`;
  private isBrowser: boolean;

  private perfilSubject = new BehaviorSubject<any | null>(null);
  public perfil$: Observable<any | null> = this.perfilSubject
    .asObservable()
    .pipe(distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)));

  public ready$ = this.perfil$.pipe(filter((p) => !!p));

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    if (this.isBrowser) {
      const raw = localStorage.getItem('perfil');
      if (raw) {
        try {
          const p = JSON.parse(raw);
          this.perfilSubject.next(p);
        } catch {
          localStorage.removeItem('perfil');
        }
      }
    }
  }

  getToken(): string | null {
    if (!this.isBrowser) return null;
    const token = localStorage.getItem('token');
    if (!token || token === 'undefined' || token === 'null') return null;
    return token;
  }

  login$(username: string, password: string) {
    return this.http.post<any>(`${this.API}/login`, { username, password }).pipe(
      map((res) => {
        const token = res?.access_token;
        if (!token) {
          throw { status: 500, error: { message: 'El servidor no devolvió access_token' } };
        }
        if (this.isBrowser) localStorage.setItem('token', token);
        return token;
      }),

      switchMap(() => this.http.get<any>(`${this.API}/perfil`)),

      tap((perfil) => {
        if (this.isBrowser) localStorage.setItem('perfil', JSON.stringify(perfil));
        this.perfilSubject.next(perfil);
      }),

      catchError((err) => throwError(() => err)),
    );
  }

  async getPerfilCached(): Promise<any> {
    const mem = this.perfilSubject.value;
    if (mem) return mem;

    if (this.isBrowser) {
      const raw = localStorage.getItem('perfil');
      if (raw) {
        try {
          const p = JSON.parse(raw);
          this.perfilSubject.next(p);
          return p;
        } catch {
          localStorage.removeItem('perfil');
        }
      }
    }

    const token = this.getToken();
    if (!token) throw new Error('No autenticado');

    const perfil = await firstValueFrom(this.http.get<any>(`${this.API}/perfil`));

    if (this.isBrowser) localStorage.setItem('perfil', JSON.stringify(perfil));
    this.perfilSubject.next(perfil);
    return perfil;
  }

  async getPerfil(): Promise<any> {
    const token = this.getToken();
    if (!token) throw new Error('No autenticado');

    const perfil = await firstValueFrom(this.http.get<any>(`${this.API}/perfil`));

    if (this.isBrowser) localStorage.setItem('perfil', JSON.stringify(perfil));
    this.perfilSubject.next(perfil);
    return perfil;
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getUserRole(): UserRole | null {
    if (!this.isBrowser) return null;

    const tokenRole = this.getRoleFromToken();
    if (tokenRole) return tokenRole;

    const perfil = this.perfilSubject.value;
    const perfilRole = perfil?.rol?.nombre ?? perfil?.rol;
    return this.normalizeRole(perfilRole);
  }

  hasAnyRole(allowedRoles: UserRole[]): boolean {
    const role = this.getUserRole();
    return !!role && allowedRoles.includes(role);
  }

  logout() {
    if (!this.isBrowser) return;
    localStorage.removeItem('token');
    localStorage.removeItem('perfil');
    this.perfilSubject.next(null);
  }

  private getRoleFromToken(): UserRole | null {
    const token = this.getToken();
    if (!token) return null;

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
    if (value === 'ADMIN' || value === 'DOCENTE' || value === 'ESTUDIANTE') return value;
    return null;
  }

  private decodeBase64Url(value: string): string {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return atob(padded);
  }
}
