import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class EvaluacionesService {
  private API = `${environment.apiUrl}/evaluaciones`;

  constructor(private http: HttpClient) {}

  // DOCENTE/ADMIN: listar todas
  listarPorCursoDocente(id_curso: number) {
    return firstValueFrom(
      this.http.get<any[]>(`${this.API}/curso/${id_curso}`).pipe(timeout(12000)),
    );
  }

  // ESTUDIANTE (o cualquiera): listar activas
  listarActivasPorCurso(id_curso: number) {
    return firstValueFrom(
      this.http.get<any[]>(`${this.API}/curso/${id_curso}/activas`).pipe(timeout(12000)),
    );
  }

  // DOCENTE/ADMIN: crear (queda INACTIVA)
  // ✅ usando tu ruta limpia: PUT /evaluaciones/curso/:id_curso
  crearEnCurso(id_curso: number, payload: any) {
    return firstValueFrom(
      this.http.put<any>(`${this.API}/curso/${id_curso}`, payload).pipe(timeout(12000)),
    );
  }

  // (si en algún lado usas la otra ruta /crear, puedes mantenerla)
  crearEnCursoCrearEndpoint(id_curso: number, payload: any) {
    return firstValueFrom(
      this.http.put<any>(`${this.API}/curso/${id_curso}/crear`, payload).pipe(timeout(12000)),
    );
  }

  activar(id_evaluacion: number) {
    return firstValueFrom(
      this.http.patch<any>(`${this.API}/${id_evaluacion}/activar`, {}).pipe(timeout(12000)),
    );
  }

  inactivar(id_evaluacion: number) {
    return firstValueFrom(
      this.http.patch<any>(`${this.API}/${id_evaluacion}/inactivar`, {}).pipe(timeout(12000)),
    );
  }

  eliminar(id_evaluacion: number) {
    return firstValueFrom(
      this.http.delete<any>(`${this.API}/${id_evaluacion}`).pipe(timeout(12000)),
    );
  }

  obtenerPorId(id: number) {
    return firstValueFrom(this.http.get<any>(`${this.API}/${id}`).pipe(timeout(12000)));
  }

  // ✅ opcional (tu backend lo tiene): PUT /evaluaciones/:id
  actualizar(id: number, payload: any) {
    return firstValueFrom(this.http.put<any>(`${this.API}/${id}`, payload).pipe(timeout(12000)));
  }
}
