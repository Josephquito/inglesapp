import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';

export type ProctoringMotivo = 'NO_FACE' | 'TAB_SWITCH' | 'WINDOW_BLUR' | 'FRAUDE';

@Injectable({ providedIn: 'root' })
export class RendicionesService {
  private API = `${environment.apiUrl}/rendiciones`;
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

  // ===============================
  // Estudiante: flujo rendición
  // ===============================
  infoRendir(id_evaluacion: number) {
    return firstValueFrom(
      this.http
        .get<any>(`${this.API}/evaluaciones/${id_evaluacion}/info-rendir`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(15000)),
    );
  }

  iniciarIntento(id_evaluacion: number) {
    return firstValueFrom(
      this.http
        .post<any>(`${this.API}/evaluaciones/${id_evaluacion}/iniciar`, null, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(15000)),
    );
  }

  obtenerPreguntasIntento(id_intento: number) {
    return firstValueFrom(
      this.http
        .get<any>(`${this.API}/intentos/${id_intento}/preguntas`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(20000)),
    );
  }

  autosaveRespuesta(id_intento: number, id_pregunta: number, payload: any) {
    return firstValueFrom(
      this.http
        .put<any>(`${this.API}/intentos/${id_intento}/preguntas/${id_pregunta}`, payload, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(15000)),
    );
  }

  finalizarIntento(id_intento: number) {
    return firstValueFrom(
      this.http
        .post<any>(`${this.API}/intentos/${id_intento}/finalizar`, null, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(20000)),
    );
  }

  verResultado(id_intento: number) {
    return firstValueFrom(
      this.http
        .get<any>(`${this.API}/intentos/${id_intento}/resultado`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(15000)),
    );
  }

  // ===============================
  // ✅ PROCTORING (cámara / antifraude)
  // ===============================

  /**
   * Llamar cuando el usuario ya concedió cámara/mic en el front
   * (stream activo).
   */
  iniciarProctoring(id_intento: number) {
    return firstValueFrom(
      this.http
        .post<any>(`${this.API}/intentos/${id_intento}/proctoring/iniciar`, null, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(15000)),
    );
  }

  /**
   * Guardar URL del video proctoring (ya subido a /uploads)
   * body: { url_video }
   */
  guardarVideoProctoring(id_intento: number, url_video: string) {
    return firstValueFrom(
      this.http
        .put<any>(
          `${this.API}/intentos/${id_intento}/proctoring/video`,
          { url_video },
          { headers: this.authHeaders() },
        )
        .pipe(timeout(20000)),
    );
  }

  /**
   * Registrar warning de fraude:
   * motivo: 'NO_FACE' | 'TAB_SWITCH' | 'WINDOW_BLUR' | ...
   * El backend te responde warnings y si suspendió.
   */
  registrarWarningFraude(id_intento: number, motivo?: ProctoringMotivo) {
    const body = motivo ? { motivo } : {};
    return firstValueFrom(
      this.http
        .post<any>(`${this.API}/intentos/${id_intento}/proctoring/warn`, body, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(15000)),
    );
  }

  // ===============================
  // Docente: revisión / calificación
  // ===============================

  listarMejorIntentoPorEstudiante(id_evaluacion: number) {
    return firstValueFrom(
      this.http
        .get<any>(`${this.API}/evaluaciones/${id_evaluacion}/intentos-mejor`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(20000)),
    );
  }

  obtenerIntentoParaRevision(id_intento: number) {
    return firstValueFrom(
      this.http
        .get<any>(`${this.API}/intentos/${id_intento}/revision`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(20000)),
    );
  }

  calificarPreguntaIntento(id_intento: number, id_pregunta: number, payload: any) {
    return firstValueFrom(
      this.http
        .put<any>(
          `${this.API}/intentos/${id_intento}/preguntas/${id_pregunta}/calificar`,
          payload,
          { headers: this.authHeaders() },
        )
        .pipe(timeout(20000)),
    );
  }

  calificarIntentoFinal(id_intento: number) {
    return firstValueFrom(
      this.http
        .post<any>(`${this.API}/intentos/${id_intento}/calificar`, null, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(20000)),
    );
  }

  // =====================================================
  // ✅ NUEVO: MENSAJE DE ERROR (faltaba en este servicio)
  // =====================================================

  getErrorMessage(error: any): string {
    // ✅ FIX: este es el caso que se perdía. TimeoutInterceptor no lanza
    // un error normal, lanza { timeout: true, message }. Sin este chequeo,
    // cae directo al genérico y el mensaje específico que armaste
    // ("el servidor tardó demasiado...") nunca le llega al estudiante.
    if (error?.timeout === true) {
      return error.message ?? 'El servidor tardó demasiado. Intenta nuevamente.';
    }

    if (error instanceof HttpErrorResponse) {
      const response = error.error;

      if (typeof response === 'string') {
        return response;
      }

      if (Array.isArray(response?.message)) {
        return response.message.join(', ');
      }

      if (typeof response?.message === 'string') {
        return response.message;
      }

      if (error.status === 0) {
        return 'No se pudo conectar con el servidor.';
      }

      if (error.status === 401) {
        return 'Tu sesión expiró. Vuelve a iniciar sesión.';
      }

      if (error.status === 403) {
        return 'No tienes permisos para realizar esta acción.';
      }

      if (error.status === 404) {
        return 'No se encontró el recurso solicitado.';
      }

      if (error.status >= 500) {
        return 'Ocurrió un error en el servidor.';
      }
    }

    return 'Ocurrió un error inesperado.';
  }
}
