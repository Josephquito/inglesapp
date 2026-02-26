import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UsuarioCrearDto {
  identificacion: string;
  nombres: string;
  apellidos: string;
  email: string;
  id_entidad: number;
  rol: number; // en backend lo usas como id_rol
  username: string;
  password: string;
}

// ✅ Update ADMIN (parcial): manda solo lo que cambies
export interface UsuarioUpdateDto {
  identificacion?: string;
  nombres?: string;
  apellidos?: string;
  email?: string;
  username?: string;

  id_entidad?: number;
  rol?: number;

  // si cambias estado desde admin (A, I, B, E, X, etc.)
  estado_codigo?: string;

  // opcional si el admin puede setear password
  password?: string;
}

export type SelectOption = { value: number | string; label: string };

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private API = `${environment.apiUrl}/auth`;

  constructor(private http: HttpClient) {}

  // ===== USUARIOS =====

  crearUsuario(data: UsuarioCrearDto) {
    return firstValueFrom(this.http.post<any>(`${this.API}/register`, data).pipe(timeout(12000)));
  }

  // ✅ ya devuelve todos los estados (porque back ya no filtra por 'A')
  listarUsuariosPorEntidad() {
    return firstValueFrom(this.http.get<any[]>(`${this.API}/listar`).pipe(timeout(12000)));
  }

  // ✅ ya devuelve todos los estados (porque back ya no filtra por 'A')
  listarTodos() {
    return firstValueFrom(this.http.get<any[]>(`${this.API}/listar-todos`).pipe(timeout(12000)));
  }

  listarPorEntidadAdmin(idEntidad: number) {
    return firstValueFrom(
      this.http.get<any[]>(`${this.API}/listar-por-entidad/${idEntidad}`).pipe(timeout(12000)),
    );
  }

  // ✅ ahora actualiza cualquier campo permitido (admin)
  actualizarPerfil(idUsuario: number, data: UsuarioUpdateDto) {
    return firstValueFrom(
      this.http.put<any>(`${this.API}/actualizar/${idUsuario}`, data).pipe(timeout(12000)),
    );
  }

  changePassword(passwordActual: string, nuevaPassword: string) {
    return firstValueFrom(
      this.http
        .patch<any>(`${this.API}/cambiarpassword`, {
          passwordActual,
          nuevaPassword,
        })
        .pipe(timeout(12000)),
    );
  }

  // ===== VALIDACIONES =====

  async verificarUsernameDisponible(
    username: string,
    idUsuario: number,
    idEntidad: number,
  ): Promise<boolean> {
    const params = new HttpParams()
      .set('username', username)
      .set('idUsuario', String(idUsuario))
      .set('idEntidad', String(idEntidad));

    const res: any = await firstValueFrom(
      this.http.get(`${this.API}/verificarusername`, { params }).pipe(timeout(12000)),
    );

    return !!res?.disponible;
  }

  async verificarIdentificacionDisponible(
    identificacion: string,
    idEntidad: number,
  ): Promise<boolean> {
    const params = new HttpParams()
      .set('identificacion', identificacion)
      .set('idEntidad', String(idEntidad));

    const res: any = await firstValueFrom(
      this.http.get(`${this.API}/verificar-identificacion`, { params }).pipe(timeout(12000)),
    );

    return !!res?.disponible;
  }

  // ===== SELECTS =====

  listarEntidadesParaSelect(): Promise<SelectOption[]> {
    return firstValueFrom(
      this.http
        .get<SelectOption[]>(`${environment.apiUrl}/entidad/selectOneMenu`)
        .pipe(timeout(12000)),
    );
  }

  listarRolesParaSelect() {
    return firstValueFrom(
      this.http.get<any[]>(`${environment.apiUrl}/roles/selectOneMenu`).pipe(timeout(12000)),
    );
  }
}
