import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';
import type { TipoPreguntaMenu } from './tipo-pregunta.service';

export type CodigoPregunta =
  | 'WRITING'
  | 'MULTIPLE_CHOICE'
  | 'SPEAKING'
  | 'MATCHING'
  | 'TRUE_FALSE'
  | 'FILL_BLANK'
  | 'CHOOSE_IMAGE'
  | 'LISTENING'
  | 'READING';

export type OpcionRespuesta = {
  texto?: string;
  url_imagen?: string;
  es_correcta?: boolean;
};

export type Emparejamiento = {
  izquierda: string;
  derecha: string;
};

// ✅ NUEVO: el párrafo de FILL_BLANK ya no es texto plano con {{blank_N}}
// escrito a mano — es una lista de pedazos. Un "blank" es un bloque atómico
// con su propia respuesta adentro: no hay token que se pueda corromper
// porque el token nunca se escribe, se genera al armar el payload.
export type FillBlankSegment =
  | { type: 'text'; value: string }
  | { type: 'blank'; numero: string; respuesta: string };

export type PreguntaPayload = {
  texto: string;
  id_tipo_pregunta: number;
  url_multimedia?: string;
  respuesta_esperada?: string;
  texto_base?: string; // ✅ FIX: requerido por el backend para FILL_BLANK
  opcionesRespuesta?: OpcionRespuesta[];
  emparejamientos?: Emparejamiento[];
};

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

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  private clean(value: any): string {
    return String(value ?? '').trim();
  }

  private codigoTipo(tipo: TipoPreguntaMenu): CodigoPregunta {
    return this.clean(tipo?.codigo).toUpperCase() as CodigoPregunta;
  }

  // =====================================================
  // HTTP
  // =====================================================

  listarPorEvaluacion(id_evaluacion: number): Promise<any[]> {
    return firstValueFrom(
      this.http
        .get<any[]>(`${this.API}/evaluaciones/${id_evaluacion}/preguntas`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    ).then((res) => (Array.isArray(res) ? res : []));
  }

  crearEnEvaluacion(id_evaluacion: number, payload: PreguntaPayload): Promise<any> {
    return firstValueFrom(
      this.http
        .post<any>(`${this.API}/evaluaciones/${id_evaluacion}/preguntas`, payload, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

  actualizar(id_pregunta: number, payload: Partial<PreguntaPayload>): Promise<any> {
    return firstValueFrom(
      this.http
        .put<any>(`${this.API}/preguntas/${id_pregunta}`, payload, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

  eliminar(id_pregunta: number): Promise<any> {
    return firstValueFrom(
      this.http
        .delete<any>(`${this.API}/preguntas/${id_pregunta}`, {
          headers: this.authHeaders(),
        })
        .pipe(timeout(12000)),
    );
  }

  // =====================================================
  // ARMAR PAYLOAD PARA CREAR / EDITAR PREGUNTA INDIVIDUAL
  // =====================================================

  buildPayload(form: any, tipo: TipoPreguntaMenu): PreguntaPayload {
    const codigo = this.codigoTipo(tipo);

    const texto = this.clean(form?.texto);
    const id_tipo_pregunta = Number(form?.id_tipo_pregunta ?? tipo?.value ?? 0);
    const url_multimedia = this.clean(form?.url_multimedia);

    const base: PreguntaPayload = {
      texto,
      id_tipo_pregunta,
      ...(url_multimedia ? { url_multimedia } : {}),
    };

    switch (codigo) {
      case 'WRITING': {
        const respuesta = this.clean(form?.respuesta_esperada);

        return {
          ...base,
          ...(respuesta ? { respuesta_esperada: respuesta } : {}),
        };
      }

      case 'SPEAKING': {
        return base;
      }

      case 'MULTIPLE_CHOICE': {
        const opcionesRespuesta: OpcionRespuesta[] = Array.isArray(form?.opcionesRespuesta)
          ? form.opcionesRespuesta
              .map((o: any) => ({
                texto: this.clean(o?.texto),
                es_correcta: !!o?.es_correcta,
              }))
              .filter((o: OpcionRespuesta) => !!o.texto)
          : [];

        return {
          ...base,
          opcionesRespuesta,
        };
      }

      case 'TRUE_FALSE': {
        const opcionesRespuesta: OpcionRespuesta[] = Array.isArray(form?.opcionesRespuesta)
          ? form.opcionesRespuesta
              .map((o: any) => ({
                texto: this.clean(o?.texto),
                es_correcta: !!o?.es_correcta,
              }))
              .filter((o: OpcionRespuesta) => !!o.texto)
          : [];

        return {
          ...base,
          opcionesRespuesta,
        };
      }

      case 'CHOOSE_IMAGE': {
        const opcionesRespuesta: OpcionRespuesta[] = Array.isArray(form?.opcionesRespuesta)
          ? form.opcionesRespuesta
              .map((o: any) => ({
                url_imagen: this.clean(o?.url_imagen),
                es_correcta: !!o?.es_correcta,
              }))
              .filter((o: OpcionRespuesta) => !!o.url_imagen)
          : [];

        return {
          ...base,
          opcionesRespuesta,
        };
      }

      case 'MATCHING': {
        const emparejamientos: Emparejamiento[] = Array.isArray(form?.emparejamientos)
          ? form.emparejamientos
              .map((p: any) => ({
                izquierda: this.clean(p?.izquierda),
                derecha: this.clean(p?.derecha),
              }))
              .filter((p: Emparejamiento) => p.izquierda.length > 0 && p.derecha.length > 0)
          : [];

        return {
          ...base,
          emparejamientos,
        };
      }

      case 'FILL_BLANK': {
        // ✅ NUEVO MODELO: el párrafo ya no viene de form.texto_base escrito
        // a mano — se reconstruye uniendo los segmentos en orden. Un "blank"
        // se serializa a su token {{blank_N}} solo aquí, al armar el payload;
        // en el formulario nunca existió como texto editable.
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

        // ✅ Banco = respuestas de los espacios (derivadas) + distractores,
        // sin duplicados. Igual que antes, solo que ahora la respuesta de
        // cada espacio viene directo del segmento, no de un arreglo paralelo.
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

      case 'LISTENING':
      case 'READING':
      default: {
        return base;
      }
    }
  }

  // =====================================================
  // VALIDACIÓN ANTES DE ENVIAR AL BACKEND
  // =====================================================

  validatePayload(payload: PreguntaPayload, tipo: TipoPreguntaMenu): string | null {
    const codigo = this.codigoTipo(tipo);

    if (!payload?.texto || this.clean(payload.texto).length === 0) {
      return 'Escribe el enunciado de la pregunta.';
    }

    if (!payload?.id_tipo_pregunta || Number(payload.id_tipo_pregunta) < 1) {
      return 'Selecciona un tipo de pregunta.';
    }

    if (tipo?.es_bloque || codigo === 'LISTENING' || codigo === 'READING') {
      return 'LISTENING/READING se crean como bloque, no como pregunta directa.';
    }

    if (codigo === 'WRITING') {
      return null;
    }

    if (codigo === 'SPEAKING') {
      return null;
    }

    if (codigo === 'MULTIPLE_CHOICE') {
      const opciones = Array.isArray(payload?.opcionesRespuesta) ? payload.opcionesRespuesta : [];

      if (opciones.length < 2) {
        return 'Agrega mínimo 2 opciones de respuesta.';
      }

      const sinTexto = opciones.some((o) => !this.clean(o?.texto));

      if (sinTexto) {
        return 'Todas las opciones deben tener texto.';
      }

      const correctas = opciones.filter((o) => !!o?.es_correcta).length;

      if (correctas < 1) {
        return 'Marca al menos una opción correcta.';
      }

      return null;
    }

    if (codigo === 'TRUE_FALSE') {
      const opciones = Array.isArray(payload?.opcionesRespuesta) ? payload.opcionesRespuesta : [];

      if (opciones.length !== 2) {
        return 'TRUE_FALSE requiere exactamente 2 opciones.';
      }

      const sinTexto = opciones.some((o) => !this.clean(o?.texto));

      if (sinTexto) {
        return 'Las opciones TRUE_FALSE deben tener texto.';
      }

      const correctas = opciones.filter((o) => !!o?.es_correcta).length;

      if (correctas !== 1) {
        return 'Marca exactamente una opción correcta.';
      }

      return null;
    }

    if (codigo === 'CHOOSE_IMAGE') {
      const opciones = Array.isArray(payload?.opcionesRespuesta) ? payload.opcionesRespuesta : [];

      if (opciones.length !== 2) {
        return 'CHOOSE_IMAGE requiere exactamente 2 opciones con imagen.';
      }

      const sinImagen = opciones.some((o) => !this.clean(o?.url_imagen));

      if (sinImagen) {
        return 'Cada opción debe tener una imagen.';
      }

      const correctas = opciones.filter((o) => !!o?.es_correcta).length;

      if (correctas !== 1) {
        return 'Marca exactamente una imagen correcta.';
      }

      return null;
    }

    if (codigo === 'MATCHING') {
      const pares = Array.isArray(payload?.emparejamientos) ? payload.emparejamientos : [];

      if (pares.length < 2) {
        return 'Agrega mínimo 2 pares para unir.';
      }

      const incompletos = pares.some((p) => !this.clean(p?.izquierda) || !this.clean(p?.derecha));

      if (incompletos) {
        return 'Todos los pares deben tener lado izquierdo y lado derecho.';
      }

      return null;
    }

    if (codigo === 'FILL_BLANK') {
      // ✅ FIX: faltaba validar texto_base; sin esto el front daba luz verde
      // y el backend rechazaba la pregunta con un 400 confuso para el docente.
      const textoBase = this.clean((payload as any)?.texto_base);

      if (!textoBase) {
        return 'Agrega el párrafo con los espacios en blanco.';
      }

      const opciones = Array.isArray(payload?.opcionesRespuesta) ? payload.opcionesRespuesta : [];

      const pares = Array.isArray(payload?.emparejamientos) ? payload.emparejamientos : [];

      if (pares.length < 1) {
        return 'Agrega al menos un espacio en blanco.';
      }

      // El banco ya no se llena a mano: se calcula solo (respuestas + distractores).
      // Si sale corto es porque falta variedad — con 1 solo espacio, necesitas
      // al menos 1 palabra distractora para llegar al mínimo de 2.
      if (opciones.length < 2) {
        return pares.length === 1
          ? 'Con un solo espacio, agrega al menos 1 palabra distractora.'
          : 'Agrega al menos una palabra distractora para completar el banco.';
      }

      // ✅ Nota: ya no hace falta verificar que el párrafo contenga el token
      // de cada espacio — con el modelo de segmentos, texto_base se construye
      // a partir de estos mismos pares, así que es imposible que no coincidan.

      return null;
    }

    return 'Tipo de pregunta no soportado.';
  }

  // =====================================================
  // VALIDACIÓN DE ESPACIOS HUÉRFANOS (FILL_BLANK)
  // =====================================================

  /**
   * Detecta espacios sin respuesta asignada.
   *
   * Con el modelo de segmentos esto ya no necesita parsear texto con regex:
   * cada espacio es un objeto con su propia `respuesta`, así que solo hay
   * que revisar si alguno la tiene vacía.
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

  // =====================================================
  // HELPER PARA CREAR PAYLOAD + VALIDAR EN UN SOLO PASO
  // =====================================================

  prepararPayload(
    form: any,
    tipo: TipoPreguntaMenu,
  ): { payload: PreguntaPayload; error: string | null } {
    const payload = this.buildPayload(form, tipo);
    const error = this.validatePayload(payload, tipo);

    return {
      payload,
      error,
    };
  }

  // =====================================================
  // MENSAJE DE ERROR DEL BACKEND
  // =====================================================

  getErrorMessage(error: any): string {
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

    if (error?.name === 'TimeoutError') {
      return 'La solicitud tardó demasiado. Intenta nuevamente.';
    }

    return 'Ocurrió un error inesperado.';
  }
}
