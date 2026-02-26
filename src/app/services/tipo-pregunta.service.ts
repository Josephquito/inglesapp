import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';

export type TipoPreguntaMenu = {
  value: number;
  label: string;
  codigo: 'WRITING' | 'MULTIPLE_CHOICE' | 'SPEAKING' | 'LISTENING' | 'MATCHING' | 'READING';
  permite_opciones: boolean;
  requiere_seleccion: boolean;
  es_bloque: boolean;
};

@Injectable({ providedIn: 'root' })
export class TipoPreguntaService {
  private API = `${environment.apiUrl}/tipopregunta`;
  private isBrowser: boolean;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  private authHeaders(): Record<string, string> {
    const token = this.isBrowser ? localStorage.getItem('token') : null;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  listar() {
    return firstValueFrom(
      this.http
        .get<any[]>(`${this.API}/listar`, { headers: this.authHeaders() })
        .pipe(timeout(12000)),
    );
  }

  selectOneMenu(): Promise<TipoPreguntaMenu[]> {
    return firstValueFrom(
      this.http
        .get<TipoPreguntaMenu[]>(`${this.API}/selectOneMenu`, { headers: this.authHeaders() })
        .pipe(timeout(12000)),
    ).then((res) => (Array.isArray(res) ? res : []));
  }

  obtenerPorId(id: number) {
    return firstValueFrom(
      this.http.get<any>(`${this.API}/${id}`, { headers: this.authHeaders() }).pipe(timeout(12000)),
    );
  }

  crear(payload: any) {
    return firstValueFrom(
      this.http
        .post<any>(`${this.API}/crear`, payload, { headers: this.authHeaders() })
        .pipe(timeout(12000)),
    );
  }
}
