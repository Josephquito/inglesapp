import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CursosService {
  private API = `${environment.apiUrl}/cursos`;

  constructor(private http: HttpClient) {}

  // GET /cursos/listar  (ADMIN/DOCENTE/ESTUDIANTE)
  listar() {
    return firstValueFrom(this.http.get<any[]>(`${this.API}/listar`).pipe(timeout(12000)));
  }

  // GET /cursos/mis-cursos  (DOCENTE/ESTUDIANTE/ADMIN)
  listarMisCursos() {
    return firstValueFrom(this.http.get<any[]>(`${this.API}/mis-cursos`).pipe(timeout(12000)));
  }

  // GET /cursos/mis-cursos/:id  (DOCENTE/ESTUDIANTE/ADMIN)
  detalleMiCurso(id_curso: number) {
    return firstValueFrom(
      this.http.get<any>(`${this.API}/mis-cursos/${id_curso}`).pipe(timeout(12000)),
    );
  }

  // GET /cursos/:id  (ADMIN/DOCENTE)
  obtenerPorId(id: number) {
    return firstValueFrom(this.http.get<any>(`${this.API}/${id}`).pipe(timeout(12000)));
  }

  // POST /cursos/crear  (ADMIN)
  crear(payload: any) {
    return firstValueFrom(this.http.post<any>(`${this.API}/crear`, payload).pipe(timeout(12000)));
  }

  // PUT /cursos/:id  (ADMIN)
  actualizar(id: number, payload: any) {
    return firstValueFrom(this.http.put<any>(`${this.API}/${id}`, payload).pipe(timeout(12000)));
  }

  // GET /cursos/usuarios/:id  (ADMIN/DOCENTE/ESTUDIANTE)
  obtenerUsuariosCurso(id_curso: number) {
    return firstValueFrom(
      this.http.get<any[]>(`${this.API}/usuarios/${id_curso}`).pipe(timeout(12000)),
    );
  }

  /**
   * POST /cursos/asignar-usuarios  (ADMIN)
   * body: { id_curso: number, usuarios: number[] }
   */
  asignarUsuarios(
    id_curso: number,
    usuarios: number[] | { id_usuario: number }[] | { id_usuario: number; id_rol?: number }[],
  ) {
    const ids = (usuarios || [])
      .map((u: any) => (typeof u === 'number' ? u : Number(u?.id_usuario)))
      .filter((x: any) => Number.isFinite(x) && x > 0);

    return firstValueFrom(
      this.http
        .post<any>(`${this.API}/asignar-usuarios`, { id_curso, usuarios: ids })
        .pipe(timeout(12000)),
    );
  }

  // DELETE /cursos/usuarios/:id/:id_usuario  (ADMIN)
  removerUsuarioDelCurso(id_curso: number, id_usuario: number) {
    return firstValueFrom(
      this.http.delete<any>(`${this.API}/usuarios/${id_curso}/${id_usuario}`).pipe(timeout(12000)),
    );
  }
}
