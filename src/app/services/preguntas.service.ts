import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';
import type { TipoPreguntaMenu } from './tipo-pregunta.service';

export type OpcionRespuesta = { texto: string; es_correcta?: boolean };
export type Emparejamiento = { izquierda: string; derecha: string };

@Injectable({ providedIn: 'root' })
export class PreguntasService {
  private API = environment.apiUrl;
  private isBrowser: boolean;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  private authHeaders(): HttpHeaders {
    const token = this.isBrowser ? localStorage.getItem('token') : null;
    let headers = new HttpHeaders();
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);
    return headers;
  }

  // =========================
  // HTTP
  // =========================

  listarPorEvaluacion(id_evaluacion: number): Promise<any[]> {
    return firstValueFrom(
      this.http
        .get<any[]>(`${this.API}/evaluaciones/${id_evaluacion}/preguntas`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    ).then((res) => (Array.isArray(res) ? res : []));
  }

  crearEnEvaluacion(id_evaluacion: number, payload: any) {
    return firstValueFrom(
      this.http
        .post<any>(`${this.API}/evaluaciones/${id_evaluacion}/preguntas`, payload, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

  actualizar(id_pregunta: number, payload: any) {
    return firstValueFrom(
      this.http
        .put<any>(`${this.API}/preguntas/${id_pregunta}`, payload, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

  eliminar(id_pregunta: number) {
    return firstValueFrom(
      this.http
        .delete<any>(`${this.API}/preguntas/${id_pregunta}`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

  // =========================
  // Helpers (payload + validación)
  // =========================

  /**
   * Regla del sistema:
   * - No existe orden (se entrega aleatorio al estudiante)
   * - No existe puntaje por pregunta (se calcula automático para sumar 100)
   *
   * Nuevo back:
   * - WRITING: {texto, id_tipo_pregunta, url_multimedia?, respuesta_esperada?}
   * - MULTIPLE_CHOICE: {texto, id_tipo_pregunta, url_multimedia?, opcionesRespuesta[]}
   * - SPEAKING: {texto, id_tipo_pregunta, url_multimedia?}
   * - MATCHING: {texto, id_tipo_pregunta, url_multimedia?, emparejamientos[]}
   *
   * NOTA: LISTENING/READING NO van por aquí (son bloques).
   */
  buildPayload(form: any, tipo: TipoPreguntaMenu): any {
    const texto = String(form?.texto ?? '').trim();
    const id_tipo_pregunta = Number(form?.id_tipo_pregunta ?? tipo?.value ?? 0);
    const url_multimedia = String(form?.url_multimedia ?? '').trim() || undefined;

    const base: any = {
      texto,
      id_tipo_pregunta,
      ...(url_multimedia ? { url_multimedia } : {}),
    };

    switch ((tipo?.codigo || '').toString().toUpperCase()) {
      case 'WRITING': {
        const resp = String(form?.respuesta_esperada ?? '').trim();
        return {
          ...base,
          ...(resp ? { respuesta_esperada: resp } : {}),
        };
      }

      case 'MULTIPLE_CHOICE': {
        const opcionesRespuesta: OpcionRespuesta[] = Array.isArray(form?.opcionesRespuesta)
          ? form.opcionesRespuesta
              .map((o: any) => ({
                texto: String(o?.texto ?? '').trim(),
                es_correcta: !!o?.es_correcta,
              }))
              .filter((o: any) => o.texto.length > 0)
          : [];

        return { ...base, opcionesRespuesta };
      }

      case 'MATCHING': {
        const emparejamientos: Emparejamiento[] = Array.isArray(form?.emparejamientos)
          ? form.emparejamientos
              .map((p: any) => ({
                izquierda: String(p?.izquierda ?? '').trim(),
                derecha: String(p?.derecha ?? '').trim(),
              }))
              .filter((p: any) => p.izquierda.length > 0 && p.derecha.length > 0)
          : [];

        return { ...base, emparejamientos };
      }

      case 'SPEAKING':
      default:
        return base;
    }
  }

  /**
   * Validación mínima antes de pegar al back.
   * Devuelve null si OK, o un mensaje de error.
   */
  validatePayload(payload: any, tipo: TipoPreguntaMenu): string | null {
    if (!payload?.texto || String(payload.texto).trim().length === 0) {
      return 'Escribe el enunciado de la pregunta.';
    }
    if (!payload?.id_tipo_pregunta || Number(payload.id_tipo_pregunta) < 1) {
      return 'Selecciona un tipo de pregunta.';
    }

    // LISTENING/READING no van por este endpoint
    if (tipo?.es_bloque) {
      return 'LISTENING/READING se crean como BLOQUE, no como pregunta directa.';
    }

    const codigo = (tipo?.codigo || '').toString().toUpperCase();

    if (codigo === 'MULTIPLE_CHOICE') {
      const ops = Array.isArray(payload?.opcionesRespuesta) ? payload.opcionesRespuesta : [];
      if (ops.length < 2) return 'Agrega mínimo 2 opciones de respuesta.';
      // aunque tu back tenga requiere_seleccion, para MC siempre obliga 1 correcta
      const ok = ops.some((o: any) => !!o?.es_correcta);
      if (!ok) return 'Marca al menos una opción correcta.';
    }

    if (codigo === 'MATCHING') {
      const pares = Array.isArray(payload?.emparejamientos) ? payload.emparejamientos : [];
      if (pares.length < 2) return 'Agrega mínimo 2 pares para unir.';
    }

    // WRITING y SPEAKING no obligan extras
    return null;
  }
}
