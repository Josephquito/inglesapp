import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';
import type { TipoPreguntaMenu } from './tipo-pregunta.service';

export type OpcionRespuesta = { texto?: string; url_imagen?: string; es_correcta?: boolean };
export type Emparejamiento = { izquierda: string; derecha: string };

// ✅ NUEVO: mismo modelo que en preguntas.service.ts — el párrafo de
// FILL_BLANK ya no es texto plano, es una lista de segmentos. El "blank"
// es un bloque atómico con su respuesta adentro, nunca texto editable.
export type FillBlankSegment =
  | { type: 'text'; value: string }
  | { type: 'blank'; numero: string; respuesta: string };

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

  private clean(value: any): string {
    return String(value ?? '').trim();
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
  // Subpreguntas dentro del bloque
  // ✅ Ya NO siempre es MULTIPLE_CHOICE: ahora soporta
  //    MULTIPLE_CHOICE, TRUE_FALSE, CHOOSE_IMAGE, MATCHING, FILL_BLANK
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
   * El payload ahora debe incluir id_tipo_pregunta (antes el back lo forzaba a MC).
   * Usa buildSubpreguntaPayload() para armarlo correctamente según el tipo.
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

  actualizarSubpreguntaMC(id_bloque: number, id_pregunta: number, payload: any) {
    return firstValueFrom(
      this.http
        .put<any>(`${this.API}/bloques/${id_bloque}/preguntas/${id_pregunta}`, payload, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

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

  buildBloquePayload(form: any, tipo: TipoPreguntaMenu): any {
    const enunciado = this.clean(form?.enunciado);
    const id_tipo_pregunta = Number(form?.id_tipo_pregunta ?? tipo?.value ?? 0);

    const base: any = { id_tipo_pregunta, enunciado };

    const codigo = (tipo?.codigo || '').toString().toUpperCase();

    if (codigo === 'LISTENING') {
      const url_audio = this.clean(form?.url_audio);
      return { ...base, url_audio };
    }

    if (codigo === 'READING') {
      const texto_base = this.clean(form?.texto_base);
      return { ...base, texto_base };
    }

    return base;
  }

  validateBloquePayload(payload: any, tipo: TipoPreguntaMenu): string | null {
    if (!tipo?.es_bloque) return 'Este tipo no es un bloque.';

    if (!payload?.enunciado || this.clean(payload.enunciado).length === 0) {
      return 'Escribe el enunciado del bloque.';
    }

    const codigo = (tipo?.codigo || '').toString().toUpperCase();

    if (codigo === 'LISTENING') {
      if (!payload?.url_audio || this.clean(payload.url_audio).length === 0) {
        return 'LISTENING requiere un audio (url_audio).';
      }
    }

    if (codigo === 'READING') {
      if (!payload?.texto_base || this.clean(payload.texto_base).length === 0) {
        return 'READING requiere el texto base (texto_base).';
      }
    }

    return null;
  }

  /**
   * ⚠️ FIRMA CAMBIADA: ahora recibe `tipo` (antes: solo `form`).
   * Arma el payload de la subpregunta según su tipo real.
   */
  buildSubpreguntaPayload(form: any, tipo: TipoPreguntaMenu): any {
    const texto = this.clean(form?.texto);
    const id_tipo_pregunta = Number(form?.id_tipo_pregunta ?? tipo?.value ?? 0);
    const url_multimedia = this.clean(form?.url_multimedia) || undefined;

    const base: any = {
      texto,
      id_tipo_pregunta,
      ...(url_multimedia ? { url_multimedia } : {}),
    };

    const codigo = (tipo?.codigo || '').toString().toUpperCase();

    switch (codigo) {
      case 'MULTIPLE_CHOICE':
      case 'TRUE_FALSE': {
        const opcionesRespuesta: OpcionRespuesta[] = Array.isArray(form?.opcionesRespuesta)
          ? form.opcionesRespuesta
              .map((o: any) => ({
                texto: this.clean(o?.texto),
                es_correcta: !!o?.es_correcta,
              }))
              .filter((o: any) => o.texto!.length > 0)
          : [];
        return { ...base, opcionesRespuesta };
      }

      case 'CHOOSE_IMAGE': {
        const opcionesRespuesta: OpcionRespuesta[] = Array.isArray(form?.opcionesRespuesta)
          ? form.opcionesRespuesta
              .map((o: any) => ({
                url_imagen: this.clean(o?.url_imagen),
                es_correcta: !!o?.es_correcta,
              }))
              .filter((o: any) => o.url_imagen!.length > 0)
          : [];
        return { ...base, opcionesRespuesta };
      }

      case 'MATCHING': {
        const emparejamientos: Emparejamiento[] = Array.isArray(form?.emparejamientos)
          ? form.emparejamientos
              .map((p: any) => ({
                izquierda: this.clean(p?.izquierda),
                derecha: this.clean(p?.derecha),
              }))
              .filter((p: any) => p.izquierda.length > 0 && p.derecha.length > 0)
          : [];
        return { ...base, emparejamientos };
      }

      case 'FILL_BLANK': {
        // ✅ NUEVO MODELO (espejo de preguntas.service.ts): el párrafo se
        // reconstruye uniendo los segmentos en orden. El token {{blank_N}}
        // solo se genera aquí, nunca existió como texto editable en el form.
        const segmentos: FillBlankSegment[] = Array.isArray(form?.fillBlankSegments)
          ? form.fillBlankSegments
          : [];

        const texto_base = segmentos
          .map((s: any) => (s.type === 'text' ? (s.value ?? '') : `{{blank_${s.numero}}}`))
          .join('')
          .trim();

        const emparejamientos: Emparejamiento[] = segmentos
          .filter(
            (s: any): s is { type: 'blank'; numero: string; respuesta: string } =>
              s.type === 'blank',
          )
          .map((s) => ({
            izquierda: this.clean(s.numero),
            derecha: this.clean(s.respuesta),
          }))
          .filter((p: Emparejamiento) => p.izquierda.length > 0 && p.derecha.length > 0);

        const distractores: string[] = Array.isArray(form?.distractores)
          ? form.distractores.map((d: any) => this.clean(d)).filter((d: string) => d.length > 0)
          : [];

        const vistos = new Set<string>();
        const opcionesRespuesta: OpcionRespuesta[] = [];

        for (const p of emparejamientos) {
          const key = p.derecha.toLowerCase();
          if (!vistos.has(key)) {
            vistos.add(key);
            opcionesRespuesta.push({ texto: p.derecha });
          }
        }
        for (const d of distractores) {
          const key = d.toLowerCase();
          if (!vistos.has(key)) {
            vistos.add(key);
            opcionesRespuesta.push({ texto: d });
          }
        }

        return {
          ...base,
          ...(texto_base ? { texto_base } : {}),
          opcionesRespuesta,
          emparejamientos,
        };
      }

      default:
        return base;
    }
  }

  /**
   * ⚠️ FIRMA CAMBIADA: ahora recibe `tipo: TipoPreguntaMenu` (antes: `requiereSeleccion: boolean`).
   */
  validateSubpreguntaPayload(payload: any, tipo: TipoPreguntaMenu): string | null {
    if (!payload?.texto || this.clean(payload.texto).length === 0) {
      return 'Escribe el enunciado de la subpregunta.';
    }

    const codigo = (tipo?.codigo || '').toString().toUpperCase();

    if (codigo === 'MULTIPLE_CHOICE' || codigo === 'TRUE_FALSE') {
      const ops = Array.isArray(payload?.opcionesRespuesta) ? payload.opcionesRespuesta : [];

      if (codigo === 'TRUE_FALSE' && ops.length !== 2) {
        return 'TRUE_FALSE requiere exactamente 2 opciones.';
      }
      if (codigo === 'MULTIPLE_CHOICE' && ops.length < 2) {
        return 'Agrega mínimo 2 opciones de respuesta.';
      }

      const correctas = ops.filter((o: any) => !!o?.es_correcta).length;
      if (tipo?.requiere_seleccion && correctas < 1) {
        return 'Marca al menos una opción correcta.';
      }
      if (codigo === 'TRUE_FALSE' && correctas !== 1) {
        return 'Marca exactamente una opción correcta.';
      }
      return null;
    }

    if (codigo === 'CHOOSE_IMAGE') {
      const ops = Array.isArray(payload?.opcionesRespuesta) ? payload.opcionesRespuesta : [];
      if (ops.length !== 2) return 'CHOOSE_IMAGE requiere exactamente 2 opciones (imágenes).';

      const sinImagen = ops.some((o: any) => !o?.url_imagen);
      if (sinImagen) return 'Cada opción debe tener una imagen.';

      const correctas = ops.filter((o: any) => !!o?.es_correcta).length;
      if (correctas !== 1) return 'Marca exactamente una opción correcta.';
      return null;
    }

    if (codigo === 'MATCHING') {
      const pares = Array.isArray(payload?.emparejamientos) ? payload.emparejamientos : [];
      if (pares.length < 2) return 'MATCHING requiere al menos 2 pares.';
      return null;
    }

    if (codigo === 'FILL_BLANK') {
      // ✅ FIX: faltaba validar texto_base — sin esto, una subpregunta
      // FILL_BLANK sin párrafo pasaba la validación del front y el
      // backend la rechazaba con un 400 confuso para el docente.
      const textoBase = this.clean(payload?.texto_base);
      if (!textoBase) {
        return 'Agrega el párrafo con los espacios en blanco.';
      }

      const pares = Array.isArray(payload?.emparejamientos) ? payload.emparejamientos : [];
      if (pares.length < 1) return 'Agrega al menos un espacio en blanco.';

      const ops = Array.isArray(payload?.opcionesRespuesta) ? payload.opcionesRespuesta : [];

      // El banco ya no se llena a mano: se calcula solo (respuestas + distractores).
      // Si sale corto es porque falta variedad — con 1 solo espacio, necesitas
      // al menos 1 distractor para llegar al mínimo de 2.
      if (ops.length < 2) {
        return pares.length === 1
          ? 'Con un solo espacio, agrega al menos 1 palabra distractora.'
          : 'Agrega al menos una palabra distractora para completar el banco.';
      }

      // ✅ Nota: ya no hace falta verificar que el párrafo contenga el token
      // de cada espacio — con segmentos, texto_base se construye a partir
      // de estos mismos pares, es imposible que no coincidan.

      return null;
    }

    return null;
  }

  // =====================================================
  // VALIDACIÓN DE ESPACIOS HUÉRFANOS (FILL_BLANK)
  // =====================================================

  /**
   * Detecta espacios sin respuesta asignada.
   *
   * Mismo cambio que en preguntas.service.ts: con segmentos no hace falta
   * parsear texto con regex, solo revisar si algún "blank" tiene la
   * respuesta vacía.
   */
  validarEspaciosCompletos(form: any): string | null {
    const segmentos: FillBlankSegment[] = Array.isArray(form?.fillBlankSegments)
      ? form.fillBlankSegments
      : [];

    const sinRespuesta = segmentos.find(
      (s): s is { type: 'blank'; numero: string; respuesta: string } =>
        s.type === 'blank' && !this.clean(s.respuesta),
    );

    if (sinRespuesta) {
      return `El espacio ${sinRespuesta.numero} no tiene una respuesta asignada.`;
    }

    return null;
  }
}
