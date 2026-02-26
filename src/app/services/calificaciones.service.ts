import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

export type CalificacionEstado = 'SIN_ENTREGAR' | 'PENDIENTE_REVISION' | 'CALIFICADO';

export type EstudianteIntentoVisible = {
  id_intento: number;
  numero_intento: number;
  puntaje_total: number;
  calificacion: number;
  pendiente_revision: boolean;
  fin_real: string | null;
  updated_at: string;
};

export type MisCalificacionesCursoResponse = {
  curso: { id_curso: number };
  evaluaciones: Array<{
    id_evaluacion: number;
    titulo: string;
    activa: boolean;
    estado_calificacion: CalificacionEstado;
    intento_visible: EstudianteIntentoVisible | null;
  }>;
};

export type DocenteIntentoVisible = {
  id_intento: number;
  puntaje_total: number;
  calificacion: number;
  pendiente_revision: boolean;
  updated_at: string;
};

export type CalificacionesCursoDocenteResponse = {
  curso: { id_curso: number };
  evaluaciones: Array<{ id_evaluacion: number; titulo: string }>;
  estudiantes: Array<{
    id_usuario: number;
    nombres: string;
    apellidos: string;
    username: string;
    email: string;
    calificaciones: Array<{
      id_evaluacion: number;
      estado_calificacion: CalificacionEstado;
      intento_visible: DocenteIntentoVisible | null;
    }>;
  }>;
};

@Injectable({ providedIn: 'root' })
export class CalificacionesService {
  // ✅ Ahora usa la URL del environment igual que CursosService
  private API = `${environment.apiUrl}/calificaciones`;

  constructor(private http: HttpClient) {}

  /**
   * GET /calificaciones/cursos/:id_curso/mis
   * Estudiante: Ver mis notas en un curso
   */
  misCalificacionesCurso(id_curso: number) {
    return firstValueFrom(
      this.http
        .get<MisCalificacionesCursoResponse>(`${this.API}/cursos/${id_curso}/mis`)
        .pipe(timeout(12000)),
    );
  }

  /**
   * GET /calificaciones/cursos/:id_curso
   * Docente/Admin: Ver matriz de notas de todos los estudiantes
   */
  calificacionesCursoDocente(id_curso: number) {
    return firstValueFrom(
      this.http
        .get<CalificacionesCursoDocenteResponse>(`${this.API}/cursos/${id_curso}`)
        .pipe(timeout(12000)),
    );
  }
}
