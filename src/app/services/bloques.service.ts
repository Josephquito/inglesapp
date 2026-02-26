import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';
import type { TipoPreguntaMenu } from './tipo-pregunta.service';

export type OpcionRespuesta = { texto: string; es_correcta?: boolean };

@Injectable({ providedIn: 'root' })
export class BloquesService {
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
  // Bloques (LISTENING / READING)
  // =========================

  listarPorEvaluacion(id_evaluacion: number): Promise<any[]> {
    return firstValueFrom(
      this.http
        .get<any[]>(`${this.API}/evaluaciones/${id_evaluacion}/bloques`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    ).then((res) => (Array.isArray(res) ? res : []));
  }

  crearEnEvaluacion(id_evaluacion: number, payload: any) {
    return firstValueFrom(
      this.http
        .post<any>(`${this.API}/evaluaciones/${id_evaluacion}/bloques`, payload, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

  actualizar(id_bloque: number, payload: any) {
    return firstValueFrom(
      this.http
        .put<any>(`${this.API}/bloques/${id_bloque}`, payload, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

  eliminar(id_bloque: number) {
    return firstValueFrom(
      this.http
        .delete<any>(`${this.API}/bloques/${id_bloque}`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

  // =========================
  // Subpreguntas dentro del bloque (siempre MULTIPLE_CHOICE)
  // =========================

  listarSubpreguntas(id_bloque: number): Promise<any[]> {
    return firstValueFrom(
      this.http
        .get<any[]>(`${this.API}/bloques/${id_bloque}/preguntas`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    ).then((res) => (Array.isArray(res) ? res : []));
  }

  /**
   * Back fuerza MULTIPLE_CHOICE internamente.
   * Aquí mandamos SOLO:
   * - texto
   * - url_multimedia? (opcional)
   * - opcionesRespuesta[]
   *
   * ❌ NO mandamos orden ni puntaje (se calcula automático 100/#preguntas)
   */
  crearSubpreguntaMC(id_bloque: number, payload: any) {
    return firstValueFrom(
      this.http
        .post<any>(`${this.API}/bloques/${id_bloque}/preguntas`, payload, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

  /**
   * ✅ Editar subpregunta (MC) dentro del bloque.
   * Endpoint esperado:
   * PUT /bloques/:id_bloque/preguntas/:id_pregunta
   *
   * Mandamos SOLO:
   * - texto
   * - url_multimedia? (opcional)
   * - opcionesRespuesta[]
   */
  actualizarSubpreguntaMC(id_bloque: number, id_pregunta: number, payload: any) {
    return firstValueFrom(
      this.http
        .put<any>(`${this.API}/bloques/${id_bloque}/preguntas/${id_pregunta}`, payload, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

  /**
   * ✅ Eliminar subpregunta dentro del bloque.
   * Endpoint esperado:
   * DELETE /bloques/:id_bloque/preguntas/:id_pregunta
   */
  eliminarSubpregunta(id_bloque: number, id_pregunta: number) {
    return firstValueFrom(
      this.http
        .delete<any>(`${this.API}/bloques/${id_bloque}/preguntas/${id_pregunta}`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

  // =========================
  // Helpers para construir payloads
  // =========================

  /**
   * Payload de bloque:
   * - LISTENING: { id_tipo_pregunta, enunciado, url_audio }
   * - READING:   { id_tipo_pregunta, enunciado, texto_base }
   *
   * ❌ NO mandamos orden
   */
  buildBloquePayload(form: any, tipo: TipoPreguntaMenu): any {
    const enunciado = String(form?.enunciado ?? '').trim();
    const id_tipo_pregunta = Number(form?.id_tipo_pregunta ?? tipo?.value ?? 0);

    const base: any = { id_tipo_pregunta, enunciado };

    const codigo = (tipo?.codigo || '').toString().toUpperCase();

    if (codigo === 'LISTENING') {
      const url_audio = String(form?.url_audio ?? '').trim();
      return { ...base, url_audio };
    }

    if (codigo === 'READING') {
      const texto_base = String(form?.texto_base ?? '').trim();
      return { ...base, texto_base };
    }

    return base;
  }

  validateBloquePayload(payload: any, tipo: TipoPreguntaMenu): string | null {
    if (!tipo?.es_bloque) return 'Este tipo no es un bloque.';

    if (!payload?.enunciado || String(payload.enunciado).trim().length === 0) {
      return 'Escribe el enunciado del bloque.';
    }

    const codigo = (tipo?.codigo || '').toString().toUpperCase();

    if (codigo === 'LISTENING') {
      if (!payload?.url_audio || String(payload.url_audio).trim().length === 0) {
        return 'LISTENING requiere un audio (url_audio).';
      }
    }

    if (codigo === 'READING') {
      if (!payload?.texto_base || String(payload.texto_base).trim().length === 0) {
        return 'READING requiere el texto base (texto_base).';
      }
    }

    return null;
  }

  /**
   * Subpregunta (MC):
   * - texto obligatorio
   * - opcionesRespuesta >= 2
   * - al menos 1 correcta
   *
   * ❌ NO valida puntaje/orden porque no existen en front
   */
  validateSubpreguntaPayload(payload: any, requiereSeleccion: boolean): string | null {
    if (!payload?.texto || String(payload.texto).trim().length === 0) {
      return 'Escribe el enunciado de la subpregunta.';
    }

    const ops = Array.isArray(payload?.opcionesRespuesta) ? payload.opcionesRespuesta : [];
    if (ops.length < 2) return 'Agrega mínimo 2 opciones de respuesta.';

    if (requiereSeleccion) {
      const ok = ops.some((o: any) => !!o?.es_correcta);
      if (!ok) return 'Marca al menos una opción correcta.';
    }

    return null;
  }

  /**
   * Helper opcional: construir payload de subpregunta desde un form.
   * Útil si quieres centralizar armado del payload.
   */
  buildSubpreguntaPayload(form: any): any {
    const texto = String(form?.texto ?? '').trim();
    const url_multimedia = String(form?.url_multimedia ?? '').trim() || undefined;

    const opcionesRespuesta: OpcionRespuesta[] = Array.isArray(form?.opcionesRespuesta)
      ? form.opcionesRespuesta
          .map((o: any) => ({
            texto: String(o?.texto ?? '').trim(),
            es_correcta: !!o?.es_correcta,
          }))
          .filter((o: any) => o.texto.length > 0)
      : [];

    return {
      texto,
      ...(url_multimedia ? { url_multimedia } : {}),
      opcionesRespuesta,
    };
  }
}
