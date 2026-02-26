import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnInit,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { PreguntasService } from '../../../../services/preguntas.service';
import { BloquesService } from '../../../../services/bloques.service';
import { TipoPreguntaService, TipoPreguntaMenu } from '../../../../services/tipo-pregunta.service';
import { UploadsService } from '../../../../services/uploads.service';

type OpcionForm = { texto: string; es_correcta: boolean };
type ParForm = { izquierda: string; derecha: string };

type SubPreguntaForm = {
  id_pregunta?: number | null; // 👈 si existe en DB
  texto: string;
  opcionesRespuesta: OpcionForm[];
};

@Component({
  selector: 'app-editar-pregunta-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './editar-pregunta.modal.html',
  styleUrls: ['../preguntas.modal.css'],
})
export class EditarPreguntaModalComponent implements OnInit {
  @Input() pregunta!: any;
  @Output() close = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  loading = false;
  uploading = false;
  error: string | null = null;

  tipos: TipoPreguntaMenu[] = [];
  tipoSel: TipoPreguntaMenu | null = null;

  form: any = {
    // suelta
    texto: '',
    id_tipo_pregunta: 0,
    url_multimedia: '',
    respuesta_esperada: '',
    opcionesRespuesta: [] as OpcionForm[],
    emparejamientos: [] as ParForm[],

    // bloque
    bloque_enunciado: '',
    url_audio: '',
    texto_base: '',
    subpreguntas: [] as SubPreguntaForm[],
  };

  // ids
  private id_pregunta: number | null = null;
  private id_bloque: number | null = null;

  // snapshot para detectar eliminadas al guardar
  private subIdsIniciales = new Set<number>();

  private preguntasApi = inject(PreguntasService);
  private bloquesApi = inject(BloquesService);
  private tipoApi = inject(TipoPreguntaService);
  private cd = inject(ChangeDetectorRef);
  private uploadsApi = inject(UploadsService);

  ngOnInit(): void {
    this.hydrateFromInput();

    // ✅ Importante: diferir la carga para evitar NG0100
    queueMicrotask(() => {
      void this.loadTipos();
    });
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) this.close.emit();
  }

  // =========================
  // Helpers tipo / bloque
  // =========================
  private getInput(): any {
    return this.pregunta?.raw ?? this.pregunta ?? {};
  }

  private inferIsBloque(item: any): boolean {
    const code = (item?.tipo?.codigo ?? item?.tipoCodigo ?? '').toString().toUpperCase();
    return (
      code === 'LISTENING' || code === 'READING' || !!item?.id_bloque || !!item?.raw?.id_bloque
    );
  }

  isBloque(): boolean {
    if (this.tipoSel) return !!this.tipoSel.es_bloque;
    return this.inferIsBloque(this.getInput());
  }

  isListening(): boolean {
    return (this.tipoSel?.codigo ?? '').toString().toUpperCase() === 'LISTENING';
  }
  isReading(): boolean {
    return (this.tipoSel?.codigo ?? '').toString().toUpperCase() === 'READING';
  }

  showWriting(): boolean {
    return (this.tipoSel?.codigo ?? '').toString().toUpperCase() === 'WRITING';
  }
  showMC(): boolean {
    return (this.tipoSel?.codigo ?? '').toString().toUpperCase() === 'MULTIPLE_CHOICE';
  }
  showSpeaking(): boolean {
    return (this.tipoSel?.codigo ?? '').toString().toUpperCase() === 'SPEAKING';
  }
  showMatching(): boolean {
    return (this.tipoSel?.codigo ?? '').toString().toUpperCase() === 'MATCHING';
  }

  // =========================
  // Hydrate inicial
  // =========================
  private hydrateFromInput() {
    const item = this.getInput();

    this.id_pregunta = item?.id_pregunta ? Number(item.id_pregunta) : null;
    this.id_bloque = item?.id_bloque ? Number(item.id_bloque) : null;

    this.form.id_tipo_pregunta = Number(
      item?.tipo?.id_tipo_pregunta ?? item?.id_tipo_pregunta ?? 0,
    );

    const isBloq = this.inferIsBloque(item);
    if (isBloq) {
      this.id_bloque = (this.id_bloque ?? Number(item?.id_bloque ?? item?.id ?? 0)) || null;

      this.form.bloque_enunciado = item?.enunciado ?? item?.texto ?? '';
      this.form.url_audio = item?.url_audio ?? '';
      this.form.texto_base = item?.texto_base ?? '';
      this.form.subpreguntas = []; // se carga por API
      return;
    }

    // suelta
    this.form.texto = item?.texto ?? '';
    this.form.url_multimedia = item?.url_multimedia ?? '';
    this.form.respuesta_esperada = item?.respuesta_esperada ?? '';

    this.form.opcionesRespuesta = Array.isArray(item?.opcionesRespuesta)
      ? item.opcionesRespuesta.map((o: any) => ({
          texto: o?.texto ?? '',
          es_correcta: !!o?.es_correcta,
        }))
      : [
          { texto: '', es_correcta: false },
          { texto: '', es_correcta: false },
        ];

    this.form.emparejamientos = Array.isArray(item?.emparejamientos)
      ? item.emparejamientos.map((p: any) => ({
          izquierda: p?.izquierda ?? '',
          derecha: p?.derecha ?? '',
        }))
      : [
          { izquierda: '', derecha: '' },
          { izquierda: '', derecha: '' },
        ];
  }

  // =========================
  // Tipos + subpreguntas
  // =========================
  async loadTipos() {
    this.loading = true;
    this.error = null;
    this.cd.detectChanges(); // ✅ pinta loading sin depender de ciclos raros

    try {
      // trae tipos
      const tipos = await this.tipoApi.selectOneMenu();

      // ✅ diferimos la asignación un microtask para evitar NG0100
      queueMicrotask(() => {
        this.tipos = Array.isArray(tipos) ? tipos : [];
        this.tipoSel =
          this.tipos.find((x) => Number(x.value) === Number(this.form.id_tipo_pregunta)) ?? null;

        this.cd.detectChanges();
      });

      // si es bloque -> cargar subpreguntas
      if (this.inferIsBloque(this.getInput())) {
        await this.loadSubpreguntas();

        // si no trae nada, deja al menos 1 subpregunta vacía
        if (!this.form.subpreguntas.length) this.addSubpregunta();
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? e?.message ?? 'No se pudieron cargar tipos de pregunta.';
      this.tipos = [];
      this.tipoSel = null;
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  // =========================
  // Subpreguntas (bloque)
  // =========================
  private normalizeSubpreguntas(apiSubs: any[]): SubPreguntaForm[] {
    return (Array.isArray(apiSubs) ? apiSubs : []).map((s: any) => ({
      id_pregunta: s?.id_pregunta ? Number(s.id_pregunta) : s?.id ? Number(s.id) : null,
      texto: s?.texto ?? '',
      url_multimedia: s?.url_multimedia ?? '',
      opcionesRespuesta: Array.isArray(s?.opcionesRespuesta)
        ? s.opcionesRespuesta.map((o: any) => ({
            texto: o?.texto ?? '',
            es_correcta: !!o?.es_correcta,
          }))
        : [
            { texto: '', es_correcta: false },
            { texto: '', es_correcta: false },
          ],
    }));
  }

  private async loadSubpreguntas() {
    const id_bloque = Number(this.id_bloque ?? 0);
    if (!id_bloque) return;

    const subs = await this.bloquesApi.listarSubpreguntas(id_bloque);
    const norm = this.normalizeSubpreguntas(subs);

    // snapshot ids iniciales
    this.subIdsIniciales = new Set<number>(
      norm.map((x) => Number(x.id_pregunta)).filter((n) => !!n),
    );

    // ✅ asigna sin mutar referencia si quieres “ultra safe”
    this.form.subpreguntas = [...norm];
    this.cd.detectChanges();
  }

  addSubpregunta() {
    this.form.subpreguntas = [
      ...(this.form.subpreguntas || []),
      {
        id_pregunta: null,
        texto: '',
        opcionesRespuesta: [
          { texto: '', es_correcta: false },
          { texto: '', es_correcta: false },
        ],
      },
    ];
  }

  removeSubpregunta(i: number) {
    const arr: SubPreguntaForm[] = this.form.subpreguntas || [];
    if (arr.length <= 1) return;
    this.form.subpreguntas = arr.filter((_, idx) => idx !== i);
  }

  addSubOpcion(iSub: number) {
    const subs: SubPreguntaForm[] = this.form.subpreguntas || [];
    const s = subs[iSub];
    if (!s) return;

    s.opcionesRespuesta = [...(s.opcionesRespuesta || []), { texto: '', es_correcta: false }];
  }

  removeSubOpcion(iSub: number, iOp: number) {
    const subs: SubPreguntaForm[] = this.form.subpreguntas || [];
    const s = subs[iSub];
    if (!s) return;

    const ops = s.opcionesRespuesta || [];
    if (ops.length <= 2) return;

    s.opcionesRespuesta = ops.filter((_, idx) => idx !== iOp);
  }

  // =========================
  // Opciones / pares (suelta)
  // =========================
  addOpcion() {
    this.form.opcionesRespuesta = [
      ...(this.form.opcionesRespuesta || []),
      { texto: '', es_correcta: false },
    ];
  }
  removeOpcion(i: number) {
    const ops: OpcionForm[] = this.form.opcionesRespuesta || [];
    if (ops.length <= 2) return;
    this.form.opcionesRespuesta = ops.filter((_: any, idx: number) => idx !== i);
  }

  addPar() {
    this.form.emparejamientos = [
      ...(this.form.emparejamientos || []),
      { izquierda: '', derecha: '' },
    ];
  }
  removePar(i: number) {
    const pares: ParForm[] = this.form.emparejamientos || [];
    if (pares.length <= 2) return;
    this.form.emparejamientos = pares.filter((_: any, idx: number) => idx !== i);
  }

  // =========================
  // Validaciones bloque + subs
  // =========================
  private validateBloqueYSubs(): string | null {
    if (!this.tipoSel) return 'Tipo inválido.';

    const enunciado = String(this.form.bloque_enunciado ?? '').trim();
    if (!enunciado) return 'Escribe el enunciado del bloque.';

    const codigo = (this.tipoSel.codigo ?? '').toString().toUpperCase();

    if (codigo === 'LISTENING') {
      const url_audio = String(this.form.url_audio ?? '').trim();
      if (!url_audio) return 'LISTENING requiere un audio (url_audio).';
    }

    if (codigo === 'READING') {
      const texto_base = String(this.form.texto_base ?? '').trim();
      if (!texto_base) return 'READING requiere el texto base (texto_base).';
    }

    const subs: SubPreguntaForm[] = Array.isArray(this.form.subpreguntas)
      ? this.form.subpreguntas
      : [];
    if (subs.length < 1) return 'Agrega al menos 1 subpregunta.';

    for (let i = 0; i < subs.length; i++) {
      const s = subs[i];
      if (!String(s.texto ?? '').trim()) return `Subpregunta ${i + 1}: escribe el enunciado.`;

      const ops = (s.opcionesRespuesta || [])
        .map((o) => ({ texto: (o.texto || '').trim(), es_correcta: !!o.es_correcta }))
        .filter((o) => o.texto.length > 0);

      if (ops.length < 2) return `Subpregunta ${i + 1}: agrega mínimo 2 opciones.`;
      if (!ops.some((o) => o.es_correcta)) return `Subpregunta ${i + 1}: marca una correcta.`;
    }

    return null;
  }

  private buildSubPayload(s: SubPreguntaForm) {
    const payload: any = {
      texto: String(s.texto ?? '').trim(),
      opcionesRespuesta: (s.opcionesRespuesta || [])
        .map((o) => ({ texto: String(o.texto ?? '').trim(), es_correcta: !!o.es_correcta }))
        .filter((o) => o.texto.length > 0),
    };
    return payload;
  }

  // =========================
  // Submit
  // =========================
  async submit() {
    this.loading = true;
    this.error = null;
    this.cd.detectChanges();

    try {
      if (!this.tipoSel) throw new Error('Selecciona un tipo de pregunta.');

      // ========= BLOQUE + SUBPREGUNTAS =========
      if (this.isBloque()) {
        const id_bloque = Number(
          this.id_bloque ?? this.getInput()?.id_bloque ?? this.getInput()?.id ?? 0,
        );
        if (!id_bloque) throw new Error('ID de bloque inválido.');

        const errVal = this.validateBloqueYSubs();
        if (errVal) throw new Error(errVal);

        const codigo = (this.tipoSel.codigo ?? '').toString().toUpperCase();

        // 1) actualizar bloque
        const payloadBloque: any = {
          id_tipo_pregunta: Number(this.form.id_tipo_pregunta),
          enunciado: String(this.form.bloque_enunciado ?? '').trim(),
        };

        if (codigo === 'LISTENING') {
          const audio = String(this.form.url_audio ?? '').trim();
          payloadBloque.url_audio = audio ? audio : null;
          payloadBloque.texto_base = null;
        }

        if (codigo === 'READING') {
          payloadBloque.texto_base = String(this.form.texto_base ?? '').trim();
          payloadBloque.url_audio = null;
        }

        await this.bloquesApi.actualizar(id_bloque, payloadBloque);

        // 2) sincronizar subpreguntas
        const subsActuales: SubPreguntaForm[] = this.form.subpreguntas || [];

        const idsActuales = new Set<number>(
          subsActuales.map((s) => Number(s.id_pregunta)).filter((n) => !!n),
        );

        // 2.a) eliminar las que estaban y ya no están
        for (const idOld of this.subIdsIniciales) {
          if (!idsActuales.has(idOld)) {
            await this.bloquesApi.eliminarSubpregunta(id_bloque, idOld);
          }
        }

        // 2.b) crear o actualizar las actuales
        for (const s of subsActuales) {
          const payloadSub = this.buildSubPayload(s);
          const errSub = this.bloquesApi.validateSubpreguntaPayload(payloadSub, true);
          if (errSub) throw new Error(errSub);

          const idp = Number(s.id_pregunta ?? 0);

          if (idp) {
            await this.bloquesApi.actualizarSubpreguntaMC(id_bloque, idp, payloadSub);
          } else {
            const created = await this.bloquesApi.crearSubpreguntaMC(id_bloque, payloadSub);
            const newId = Number(created?.id_pregunta ?? created?.id ?? 0);
            if (newId) s.id_pregunta = newId;
          }
        }

        this.updated.emit();
        return;
      }

      // ========= PREGUNTA SUELTA =========
      const id_pregunta = Number(
        this.id_pregunta ?? this.getInput()?.id_pregunta ?? this.getInput()?.id ?? 0,
      );
      if (!id_pregunta) throw new Error('ID de pregunta inválido.');

      if (!String(this.form.texto ?? '').trim())
        throw new Error('Escribe el enunciado de la pregunta.');

      const payload = this.preguntasApi.buildPayload(this.form, this.tipoSel);
      const url = String(this.form.url_multimedia ?? '').trim();
      payload.url_multimedia = url ? url : null;
      const err = this.preguntasApi.validatePayload(payload, this.tipoSel);
      if (err) throw new Error(err);

      await this.preguntasApi.actualizar(id_pregunta, payload);
      this.updated.emit();
    } catch (e: any) {
      this.error = e?.error?.message ?? e?.message ?? 'No se pudo actualizar.';
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  // =========================
  // Uploads (simple, igual a crear)
  // =========================
  private uploadToField(file: File | null, setter: (url: string) => void) {
    if (!file) return;
    this.error = null;
    this.uploading = true;

    this.uploadsApi.upload(file).subscribe({
      next: (r) => {
        const url = String(r?.url ?? '').trim();
        if (url) setter(url);
        this.uploading = false;
        // si tu modal a veces no repinta, puedes descomentar esto:
        // this.cd.detectChanges();
      },
      error: (e) => {
        this.error = e?.error?.message ?? e?.message ?? 'No se pudo subir el archivo.';
        this.uploading = false;
        // this.cd.detectChanges();
      },
    });
  }

  subirMultimediaPregunta(file: File | null) {
    this.uploadToField(file, (url) => (this.form.url_multimedia = url));
  }

  subirAudioBloque(file: File | null) {
    this.uploadToField(file, (url) => (this.form.url_audio = url));
  }

  subirMultimediaSubpregunta(iSub: number, file: File | null) {
    this.uploadToField(file, (url) => {
      if (!this.form.subpreguntas?.[iSub]) return;
      this.form.subpreguntas[iSub].url_multimedia = url;
    });
  }
}
