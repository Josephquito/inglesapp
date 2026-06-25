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

type CodigoTipo =
  | 'WRITING'
  | 'MULTIPLE_CHOICE'
  | 'SPEAKING'
  | 'LISTENING'
  | 'MATCHING'
  | 'READING'
  | 'TRUE_FALSE'
  | 'FILL_BLANK'
  | 'CHOOSE_IMAGE';

type OpcionForm = {
  texto?: string;
  url_imagen?: string;
  es_correcta: boolean;
};

type ParForm = {
  izquierda: string;
  derecha: string;
};

type SubPreguntaForm = {
  id_pregunta?: number | null;
  id_tipo_pregunta: number;
  texto: string;
  url_multimedia?: string;
  opcionesRespuesta: OpcionForm[];
  emparejamientos: ParForm[];
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
    // PREGUNTA SUELTA
    texto: '',
    id_tipo_pregunta: 0,
    url_multimedia: '',
    respuesta_esperada: '',
    opcionesRespuesta: [] as OpcionForm[],
    emparejamientos: [] as ParForm[],

    // BLOQUE
    bloque_enunciado: '',
    url_audio: '',
    texto_base: '',
    subpreguntas: [] as SubPreguntaForm[],
  };

  private id_pregunta: number | null = null;
  private id_bloque: number | null = null;

  private originalEsBloque = false;
  private subIdsIniciales = new Set<number>();

  uploadingImgOpcionIndex: number | null = null;
  uploadingImgSubKey: string | null = null;

  private preguntasApi = inject(PreguntasService);
  private bloquesApi = inject(BloquesService);
  private tipoApi = inject(TipoPreguntaService);
  private uploadsApi = inject(UploadsService);
  private cd = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.hydrateFromInput();

    queueMicrotask(() => {
      void this.loadTipos();
    });
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }

  // =====================================================
  // HELPERS GENERALES
  // =====================================================

  private getInput(): any {
    return this.pregunta?.raw ?? this.pregunta ?? {};
  }

  private clean(value: any): string {
    return String(value ?? '').trim();
  }

  private codigoDeTipo(tipo: TipoPreguntaMenu | null | undefined): CodigoTipo | string {
    return this.clean(tipo?.codigo).toUpperCase();
  }

  private codigoFromItem(item: any): string {
    return this.clean(item?.tipo?.codigo ?? item?.tipoCodigo ?? '').toUpperCase();
  }

  private inferIsBloque(item: any): boolean {
    const code = this.codigoFromItem(item);

    return (
      code === 'LISTENING' ||
      code === 'READING' ||
      !!item?.tipo?.es_bloque ||
      !!item?.id_bloque ||
      !!item?.raw?.id_bloque
    );
  }

  private errorMsg(e: any): string {
    if (this.preguntasApi.getErrorMessage) {
      const msg = this.preguntasApi.getErrorMessage(e);
      if (msg) return msg;
    }

    return e?.error?.message ?? e?.message ?? 'No se pudo actualizar.';
  }

  // =====================================================
  // ESTADO DEL TIPO SELECCIONADO
  // =====================================================

  isBloque(): boolean {
    return this.originalEsBloque;
  }

  isListening(): boolean {
    return this.codigoDeTipo(this.tipoSel) === 'LISTENING';
  }

  isReading(): boolean {
    return this.codigoDeTipo(this.tipoSel) === 'READING';
  }

  showWriting(): boolean {
    return this.codigoDeTipo(this.tipoSel) === 'WRITING';
  }

  showMC(): boolean {
    return this.codigoDeTipo(this.tipoSel) === 'MULTIPLE_CHOICE';
  }

  showSpeaking(): boolean {
    return this.codigoDeTipo(this.tipoSel) === 'SPEAKING';
  }

  showMatching(): boolean {
    return this.codigoDeTipo(this.tipoSel) === 'MATCHING';
  }

  showTrueFalse(): boolean {
    return this.codigoDeTipo(this.tipoSel) === 'TRUE_FALSE';
  }

  showFillBlank(): boolean {
    return this.codigoDeTipo(this.tipoSel) === 'FILL_BLANK';
  }

  showChooseImage(): boolean {
    return this.codigoDeTipo(this.tipoSel) === 'CHOOSE_IMAGE';
  }

  topTiposDisponibles(tipos: TipoPreguntaMenu[]): TipoPreguntaMenu[] {
    const lista = tipos || [];

    if (this.originalEsBloque) {
      return lista.filter((t) => {
        const codigo = this.clean(t.codigo).toUpperCase();
        return codigo === 'LISTENING' || codigo === 'READING' || !!t.es_bloque;
      });
    }

    return lista.filter((t) => {
      const codigo = this.clean(t.codigo).toUpperCase();
      return codigo !== 'LISTENING' && codigo !== 'READING' && !t.es_bloque;
    });
  }

  subTiposDisponibles(tipos: TipoPreguntaMenu[]): TipoPreguntaMenu[] {
    return (tipos || []).filter((t) => {
      if (t.es_bloque) return false;

      const codigo = this.clean(t.codigo).toUpperCase();

      return codigo !== 'WRITING' && codigo !== 'SPEAKING';
    });
  }

  subCodigo(sp: SubPreguntaForm): string {
    const tipo = this.tipos.find((t) => Number(t.value) === Number(sp.id_tipo_pregunta));
    return this.clean(tipo?.codigo).toUpperCase();
  }

  // =====================================================
  // HYDRATE INICIAL
  // =====================================================

  private hydrateFromInput() {
    const item = this.getInput();

    this.originalEsBloque = this.inferIsBloque(item);

    this.id_pregunta = item?.id_pregunta
      ? Number(item.id_pregunta)
      : item?.id
        ? Number(item.id)
        : null;

    this.id_bloque = item?.id_bloque
      ? Number(item.id_bloque)
      : item?.raw?.id_bloque
        ? Number(item.raw.id_bloque)
        : null;

    this.form.id_tipo_pregunta = Number(
      item?.tipo?.id_tipo_pregunta ?? item?.id_tipo_pregunta ?? 0,
    );

    if (this.originalEsBloque) {
      this.id_bloque = (this.id_bloque ?? Number(item?.id_bloque ?? item?.id ?? 0)) || null;

      this.form.bloque_enunciado = item?.enunciado ?? item?.texto ?? '';
      this.form.url_audio = item?.url_audio ?? '';
      this.form.texto_base = item?.texto_base ?? '';
      this.form.subpreguntas = [];

      return;
    }

    const codigo = this.codigoFromItem(item);

    this.form.texto = item?.texto ?? '';
    this.form.url_multimedia = item?.url_multimedia ?? '';
    this.form.respuesta_esperada = item?.respuesta_esperada ?? '';

    this.form.opcionesRespuesta = this.normalizeOpciones(item?.opcionesRespuesta, codigo);

    this.form.emparejamientos = this.normalizePares(item?.emparejamientos, codigo);
  }

  private normalizeOpciones(opciones: any, codigo: string): OpcionForm[] {
    const arr: OpcionForm[] = Array.isArray(opciones)
      ? opciones.map((o: any) => ({
          texto: o?.texto ?? '',
          url_imagen: o?.url_imagen ?? '',
          es_correcta: !!o?.es_correcta,
        }))
      : [];

    if (arr.length > 0) {
      return arr;
    }

    switch (codigo) {
      case 'TRUE_FALSE':
        return [
          { texto: 'True', es_correcta: false },
          { texto: 'False', es_correcta: false },
        ];

      case 'CHOOSE_IMAGE':
        return [
          { url_imagen: '', es_correcta: false },
          { url_imagen: '', es_correcta: false },
        ];

      case 'MULTIPLE_CHOICE':
      case 'FILL_BLANK':
        return [
          { texto: '', es_correcta: false },
          { texto: '', es_correcta: false },
        ];

      default:
        return [];
    }
  }

  private normalizePares(pares: any, codigo: string): ParForm[] {
    const arr: ParForm[] = Array.isArray(pares)
      ? pares.map((p: any) => ({
          izquierda: p?.izquierda ?? '',
          derecha: p?.derecha ?? '',
        }))
      : [];

    if (arr.length > 0) {
      return arr;
    }

    switch (codigo) {
      case 'MATCHING':
        return [
          { izquierda: '', derecha: '' },
          { izquierda: '', derecha: '' },
        ];

      case 'FILL_BLANK':
        return [{ izquierda: '1', derecha: '' }];

      default:
        return [];
    }
  }

  // =====================================================
  // CARGA DE TIPOS Y SUBPREGUNTAS
  // =====================================================

  async loadTipos() {
    this.loading = true;
    this.error = null;
    this.cd.detectChanges();

    try {
      const tipos = await this.tipoApi.selectOneMenu();

      this.tipos = Array.isArray(tipos) ? tipos : [];
      this.tipoSel =
        this.tipos.find((x) => Number(x.value) === Number(this.form.id_tipo_pregunta)) ?? null;

      if (this.originalEsBloque) {
        await this.loadSubpreguntas();

        if (!this.form.subpreguntas.length) {
          this.addSubpregunta();
        }
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

  onTipoSelected(id: any) {
    const idNum = Number(id || 0);

    this.error = null;
    this.form.id_tipo_pregunta = idNum;

    this.tipoSel = this.tipos.find((t) => Number(t.value) === idNum) ?? null;

    const codigo = this.codigoDeTipo(this.tipoSel);
    this.resetCamposPorTipo(codigo);
  }

  private resetCamposPorTipo(codigo: string) {
    if (codigo !== 'WRITING') {
      this.form.respuesta_esperada = '';
    }

    if (codigo !== 'LISTENING') {
      this.form.url_audio = '';
    }

    if (codigo !== 'READING') {
      this.form.texto_base = '';
    }

    switch (codigo) {
      case 'MULTIPLE_CHOICE':
        this.form.opcionesRespuesta = [
          { texto: '', es_correcta: false },
          { texto: '', es_correcta: false },
        ];
        this.form.emparejamientos = [];
        break;

      case 'TRUE_FALSE':
        this.form.opcionesRespuesta = [
          { texto: 'True', es_correcta: false },
          { texto: 'False', es_correcta: false },
        ];
        this.form.emparejamientos = [];
        break;

      case 'CHOOSE_IMAGE':
        this.form.opcionesRespuesta = [
          { url_imagen: '', es_correcta: false },
          { url_imagen: '', es_correcta: false },
        ];
        this.form.emparejamientos = [];
        break;

      case 'MATCHING':
        this.form.opcionesRespuesta = [];
        this.form.emparejamientos = [
          { izquierda: '', derecha: '' },
          { izquierda: '', derecha: '' },
        ];
        break;

      case 'FILL_BLANK':
        this.form.opcionesRespuesta = [
          { texto: '', es_correcta: false },
          { texto: '', es_correcta: false },
        ];
        this.form.emparejamientos = [{ izquierda: '1', derecha: '' }];
        break;

      case 'WRITING':
      case 'SPEAKING':
        this.form.opcionesRespuesta = [];
        this.form.emparejamientos = [];
        break;
    }
  }

  // =====================================================
  // SUBPREGUNTAS DE BLOQUE
  // =====================================================

  private normalizeSubpreguntas(apiSubs: any[]): SubPreguntaForm[] {
    return (Array.isArray(apiSubs) ? apiSubs : []).map((s: any) => {
      const codigo = this.clean(s?.tipo?.codigo ?? s?.tipoCodigo).toUpperCase();

      return {
        id_pregunta: s?.id_pregunta ? Number(s.id_pregunta) : s?.id ? Number(s.id) : null,
        id_tipo_pregunta: Number(s?.tipo?.id_tipo_pregunta ?? s?.id_tipo_pregunta ?? 0),
        texto: s?.texto ?? '',
        url_multimedia: s?.url_multimedia ?? '',
        opcionesRespuesta: this.normalizeOpciones(s?.opcionesRespuesta, codigo),
        emparejamientos: this.normalizePares(s?.emparejamientos, codigo),
      };
    });
  }

  private async loadSubpreguntas() {
    const id_bloque = Number(this.id_bloque ?? 0);
    if (!id_bloque) return;

    const subs = await this.bloquesApi.listarSubpreguntas(id_bloque);
    const norm = this.normalizeSubpreguntas(subs);

    this.subIdsIniciales = new Set<number>(
      norm.map((x) => Number(x.id_pregunta)).filter((n) => !!n),
    );

    this.form.subpreguntas = [...norm];
    this.cd.detectChanges();
  }

  private getTipoMC(): TipoPreguntaMenu {
    const tipoMC = this.tipos.find((t) => this.clean(t.codigo).toUpperCase() === 'MULTIPLE_CHOICE');

    if (!tipoMC) {
      throw new Error('No existe el tipo MULTIPLE_CHOICE. Revisa el seed.');
    }

    return tipoMC;
  }

  addSubpregunta() {
    const tipoMC = this.tipos.find((t) => this.clean(t.codigo).toUpperCase() === 'MULTIPLE_CHOICE');

    this.form.subpreguntas = [
      ...(this.form.subpreguntas || []),
      {
        id_pregunta: null,
        id_tipo_pregunta: Number(tipoMC?.value ?? 0),
        texto: '',
        url_multimedia: '',
        opcionesRespuesta: [
          { texto: '', es_correcta: false },
          { texto: '', es_correcta: false },
        ],
        emparejamientos: [],
      },
    ];
  }

  removeSubpregunta(i: number) {
    const arr: SubPreguntaForm[] = this.form.subpreguntas || [];
    if (arr.length <= 1) return;

    this.form.subpreguntas = arr.filter((_, idx) => idx !== i);
  }

  onSubTipoChange(iSub: number, idTipo: any) {
    const idNum = Number(idTipo || 0);
    const tipo = this.tipos.find((t) => Number(t.value) === idNum);
    const codigo = this.codigoDeTipo(tipo);

    const sp = this.form.subpreguntas?.[iSub];
    if (!sp) return;

    sp.id_tipo_pregunta = idNum;

    switch (codigo) {
      case 'MULTIPLE_CHOICE':
        sp.opcionesRespuesta = [
          { texto: '', es_correcta: false },
          { texto: '', es_correcta: false },
        ];
        sp.emparejamientos = [];
        break;

      case 'TRUE_FALSE':
        sp.opcionesRespuesta = [
          { texto: 'True', es_correcta: false },
          { texto: 'False', es_correcta: false },
        ];
        sp.emparejamientos = [];
        break;

      case 'CHOOSE_IMAGE':
        sp.opcionesRespuesta = [
          { url_imagen: '', es_correcta: false },
          { url_imagen: '', es_correcta: false },
        ];
        sp.emparejamientos = [];
        break;

      case 'MATCHING':
        sp.opcionesRespuesta = [];
        sp.emparejamientos = [
          { izquierda: '', derecha: '' },
          { izquierda: '', derecha: '' },
        ];
        break;

      case 'FILL_BLANK':
        sp.opcionesRespuesta = [
          { texto: '', es_correcta: false },
          { texto: '', es_correcta: false },
        ];
        sp.emparejamientos = [{ izquierda: '1', derecha: '' }];
        break;

      default:
        sp.opcionesRespuesta = [];
        sp.emparejamientos = [];
        break;
    }
  }

  onSubRadioCorrecta(opciones: OpcionForm[], index: number) {
    opciones.forEach((o, idx) => {
      o.es_correcta = idx === index;
    });
  }

  addSubOpcion(iSub: number) {
    const sp = this.form.subpreguntas?.[iSub];
    if (!sp) return;

    sp.opcionesRespuesta = [...(sp.opcionesRespuesta || []), { texto: '', es_correcta: false }];
  }

  removeSubOpcion(iSub: number, iOp: number) {
    const sp = this.form.subpreguntas?.[iSub];
    if (!sp) return;

    const ops: OpcionForm[] = sp.opcionesRespuesta || [];
    if (ops.length <= 2) return;

    sp.opcionesRespuesta = ops.filter((_op: OpcionForm, idx: number) => idx !== iOp);
  }

  addSubPar(iSub: number) {
    const sp = this.form.subpreguntas?.[iSub];
    if (!sp) return;

    sp.emparejamientos = [...(sp.emparejamientos || []), { izquierda: '', derecha: '' }];
  }

  removeSubPar(iSub: number, iPar: number) {
    const sp = this.form.subpreguntas?.[iSub];
    if (!sp) return;

    const pares: ParForm[] = sp.emparejamientos || [];
    if (pares.length <= 1) return;

    sp.emparejamientos = pares.filter((_par: ParForm, idx: number) => idx !== iPar);
  }

  // =====================================================
  // OPCIONES / PARES DE PREGUNTA SUELTA
  // =====================================================

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
    if (pares.length <= 1) return;

    this.form.emparejamientos = pares.filter((_: any, idx: number) => idx !== i);
  }

  onRadioCorrecta(index: number) {
    this.form.opcionesRespuesta.forEach((o: OpcionForm, idx: number) => {
      o.es_correcta = idx === index;
    });
  }

  // =====================================================
  // VALIDACIONES
  // =====================================================

  private validatePreguntaSuelta(): string | null {
    if (!this.tipoSel) return 'Tipo inválido.';

    const payload = this.preguntasApi.buildPayload(this.form, this.tipoSel);

    return this.preguntasApi.validatePayload(payload, this.tipoSel);
  }

  private validateBloqueYSubs(): string | null {
    if (!this.tipoSel) return 'Tipo inválido.';

    const enunciado = this.clean(this.form.bloque_enunciado);
    if (!enunciado) return 'Escribe el enunciado del bloque.';

    const codigo = this.codigoDeTipo(this.tipoSel);

    if (codigo === 'LISTENING') {
      const url_audio = this.clean(this.form.url_audio);
      if (!url_audio) return 'LISTENING requiere un audio.';
    }

    if (codigo === 'READING') {
      const texto_base = this.clean(this.form.texto_base);
      if (!texto_base) return 'READING requiere el texto base.';
    }

    const subs: SubPreguntaForm[] = Array.isArray(this.form.subpreguntas)
      ? this.form.subpreguntas
      : [];

    if (subs.length < 1) return 'Agrega al menos 1 subpregunta.';

    for (let i = 0; i < subs.length; i++) {
      const s = subs[i];

      if (!this.clean(s.texto)) {
        return `Subpregunta ${i + 1}: escribe el enunciado.`;
      }

      const tipoSub = this.tipos.find((t) => Number(t.value) === Number(s.id_tipo_pregunta));

      if (!tipoSub) {
        return `Subpregunta ${i + 1}: selecciona un tipo.`;
      }

      const payloadSub = this.bloquesApi.buildSubpreguntaPayload(s, tipoSub);
      const errSub = this.bloquesApi.validateSubpreguntaPayload(payloadSub, tipoSub);

      if (errSub) {
        return `Subpregunta ${i + 1}: ${errSub}`;
      }
    }

    return null;
  }

  // =====================================================
  // SUBMIT
  // =====================================================

  async submit() {
    this.loading = true;
    this.error = null;
    this.cd.detectChanges();

    try {
      if (!this.tipoSel) {
        throw new Error('Selecciona un tipo de pregunta.');
      }

      // =================================================
      // BLOQUE
      // =================================================
      if (this.isBloque()) {
        const id_bloque = Number(
          this.id_bloque ?? this.getInput()?.id_bloque ?? this.getInput()?.id ?? 0,
        );

        if (!id_bloque) {
          throw new Error('ID de bloque inválido.');
        }

        const errVal = this.validateBloqueYSubs();
        if (errVal) throw new Error(errVal);

        const codigo = this.codigoDeTipo(this.tipoSel);

        const payloadBloque: any = {
          id_tipo_pregunta: Number(this.form.id_tipo_pregunta),
          enunciado: this.clean(this.form.bloque_enunciado),
        };

        if (codigo === 'LISTENING') {
          payloadBloque.url_audio = this.clean(this.form.url_audio);
          payloadBloque.texto_base = null;
        }

        if (codigo === 'READING') {
          payloadBloque.texto_base = this.clean(this.form.texto_base);
          payloadBloque.url_audio = null;
        }

        await this.bloquesApi.actualizar(id_bloque, payloadBloque);

        const subsActuales: SubPreguntaForm[] = this.form.subpreguntas || [];

        const idsActuales = new Set<number>(
          subsActuales.map((s) => Number(s.id_pregunta)).filter((n) => !!n),
        );

        for (const idOld of this.subIdsIniciales) {
          if (!idsActuales.has(idOld)) {
            await this.bloquesApi.eliminarSubpregunta(id_bloque, idOld);
          }
        }

        for (const s of subsActuales) {
          const tipoSub = this.tipos.find((t) => Number(t.value) === Number(s.id_tipo_pregunta));

          if (!tipoSub) {
            throw new Error('Selecciona el tipo para cada subpregunta.');
          }

          const payloadSub = this.bloquesApi.buildSubpreguntaPayload(s, tipoSub);
          const errSub = this.bloquesApi.validateSubpreguntaPayload(payloadSub, tipoSub);

          if (errSub) {
            throw new Error(errSub);
          }

          const idp = Number(s.id_pregunta ?? 0);

          if (idp) {
            await this.bloquesApi.actualizarSubpreguntaMC(id_bloque, idp, payloadSub);
          } else {
            const created = await this.bloquesApi.crearSubpreguntaMC(id_bloque, payloadSub);
            const newId = Number(created?.id_pregunta ?? created?.id ?? 0);

            if (newId) {
              s.id_pregunta = newId;
            }
          }
        }

        this.updated.emit();
        return;
      }

      // =================================================
      // PREGUNTA SUELTA
      // =================================================
      const id_pregunta = Number(
        this.id_pregunta ?? this.getInput()?.id_pregunta ?? this.getInput()?.id ?? 0,
      );

      if (!id_pregunta) {
        throw new Error('ID de pregunta inválido.');
      }

      const errPregunta = this.validatePreguntaSuelta();
      if (errPregunta) throw new Error(errPregunta);

      const payload = this.preguntasApi.buildPayload(this.form, this.tipoSel);

      const url = this.clean(this.form.url_multimedia);
      (payload as any).url_multimedia = url ? url : null;

      await this.preguntasApi.actualizar(id_pregunta, payload);

      this.updated.emit();
    } catch (e: any) {
      this.error = this.errorMsg(e);
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  // =====================================================
  // UPLOADS
  // =====================================================

  private uploadToField(file: File | null, setter: (url: string) => void) {
    if (!file) return;

    this.error = null;
    this.uploading = true;
    this.cd.detectChanges();

    this.uploadsApi.upload(file).subscribe({
      next: (r: any) => {
        const url = this.clean(r?.url);
        if (url) setter(url);

        this.uploading = false;
        this.cd.detectChanges();
      },
      error: (e: any) => {
        this.error = e?.error?.message ?? e?.message ?? 'No se pudo subir el archivo.';
        this.uploading = false;
        this.cd.detectChanges();
      },
    });
  }

  subirMultimediaPregunta(file: File | null) {
    this.uploadToField(file, (url) => {
      this.form.url_multimedia = url;
    });
  }

  subirAudioBloque(file: File | null) {
    this.uploadToField(file, (url) => {
      this.form.url_audio = url;
    });
  }

  subirMultimediaSubpregunta(iSub: number, file: File | null) {
    this.uploadToField(file, (url) => {
      if (!this.form.subpreguntas?.[iSub]) return;
      this.form.subpreguntas[iSub].url_multimedia = url;
    });
  }

  subirImagenOpcion(iOp: number, file: File | null) {
    if (!file) return;

    this.uploadingImgOpcionIndex = iOp;
    this.error = null;
    this.cd.detectChanges();

    this.uploadsApi.upload(file).subscribe({
      next: (r: any) => {
        const url = this.clean(r?.url);
        const op = this.form.opcionesRespuesta?.[iOp];

        if (op && url) {
          op.url_imagen = url;
        }

        this.uploadingImgOpcionIndex = null;
        this.cd.detectChanges();
      },
      error: (e: any) => {
        this.error = e?.error?.message ?? e?.message ?? 'No se pudo subir la imagen.';
        this.uploadingImgOpcionIndex = null;
        this.cd.detectChanges();
      },
    });
  }

  isUploadingImgOpcion(iOp: number): boolean {
    return this.uploadingImgOpcionIndex === iOp;
  }

  subirImagenSubOpcion(iSub: number, iOp: number, file: File | null) {
    if (!file) return;

    const key = `${iSub}-${iOp}`;
    this.uploadingImgSubKey = key;
    this.error = null;
    this.cd.detectChanges();

    this.uploadsApi.upload(file).subscribe({
      next: (r: any) => {
        const url = this.clean(r?.url);
        const op = this.form.subpreguntas?.[iSub]?.opcionesRespuesta?.[iOp];

        if (op && url) {
          op.url_imagen = url;
        }

        this.uploadingImgSubKey = null;
        this.cd.detectChanges();
      },
      error: (e: any) => {
        this.error = e?.error?.message ?? e?.message ?? 'No se pudo subir la imagen.';
        this.uploadingImgSubKey = null;
        this.cd.detectChanges();
      },
    });
  }

  isUploadingImgSub(iSub: number, iOp: number): boolean {
    return this.uploadingImgSubKey === `${iSub}-${iOp}`;
  }
}
