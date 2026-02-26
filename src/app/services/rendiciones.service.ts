import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
}
