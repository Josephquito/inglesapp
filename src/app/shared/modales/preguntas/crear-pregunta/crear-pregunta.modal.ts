import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Observable,
  of,
  defer,
  from,
  Subject,
  BehaviorSubject,
  combineLatest,
  Subscription,
} from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, tap, filter } from 'rxjs/operators';

import { PreguntasService, FillBlankSegment } from '../../../../services/preguntas.service';
import { BloquesService } from '../../../../services/bloques.service';
import { TipoPreguntaService, TipoPreguntaMenu } from '../../../../services/tipo-pregunta.service';
import { UploadsService } from '../../../../services/uploads.service';

type OpcionForm = { texto?: string; url_imagen?: string; es_correcta: boolean };
type ParForm = { izquierda: string; derecha: string };

type SubPreguntaForm = {
  id_tipo_pregunta: number;
  texto: string;
  opcionesRespuesta: OpcionForm[];
  emparejamientos: ParForm[];
  fillBlankSegments: FillBlankSegment[]; // ✅ NUEVO: reemplaza a texto_base para FILL_BLANK
  distractores: string[]; // solo para FILL_BLANK
};

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

type TiposState = {
  loadingTipos: boolean;
  errorTipos: string | null;
  tipos: TipoPreguntaMenu[];
};

type UploadKind = 'pregunta' | 'audio';

type UploadState = {
  uploading: boolean;
  uploadError: string | null;
  kind: UploadKind | null;
  url: string | null;
};

type UiState = {
  saving: boolean;
  error: string | null;
};

type Flags = {
  showCommon: boolean;
  showWriting: boolean;
  showMC: boolean;
  showSpeaking: boolean;
  showMatching: boolean;
  showTrueFalse: boolean;
  showFillBlank: boolean;
  showChooseImage: boolean;
  isListening: boolean;
  isReading: boolean;
  isBloqueSel: boolean;
};

type Vm = TiposState &
  UiState &
  UploadState & {
    tipoSel: TipoPreguntaMenu | null;
    codigoSel: CodigoTipo | '' | string;
    flags: Flags;
  };

@Component({
  selector: 'app-crear-pregunta-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crear-pregunta.modal.html',
  styleUrls: ['../preguntas.modal.css'],
})
export class CrearPreguntaModalComponent implements OnInit, OnDestroy {
  @Input() idEvaluacion!: number;

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  form = {
    id_tipo_pregunta: 0,

    // PREGUNTA SUELTA
    texto: '',
    url_multimedia: '',

    // WRITING
    respuesta_esperada: '',

    // MC
    opcionesRespuesta: [
      { texto: '', es_correcta: false },
      { texto: '', es_correcta: false },
    ] as OpcionForm[],

    // MATCHING (pares libres)
    emparejamientos: [
      { izquierda: '', derecha: '' },
      { izquierda: '', derecha: '' },
    ] as ParForm[],

    // FILL_BLANK — ✅ NUEVO: ya no es texto_base + emparejamientos por
    // separado. Es una sola lista de segmentos (texto / espacio), donde
    // cada espacio ya trae su respuesta adentro. No hay token que se
    // pueda escribir mal porque el token nunca se escribe a mano.
    fillBlankSegments: [{ type: 'text', value: '' }] as FillBlankSegment[],
    distractores: [] as string[],

    // BLOQUE
    bloque_enunciado: '',
    url_audio: '', // LISTENING
    texto_base: '', // READING (sin relación con FILL_BLANK, son cosas distintas)
    subpreguntas: [] as SubPreguntaForm[],
  };

  private ui$ = new BehaviorSubject<UiState>({ saving: false, error: null });
  private tipoId$ = new BehaviorSubject<number>(0);
  private uploadTrigger$ = new Subject<{ kind: UploadKind; file: File }>();

  uploadingImgKey: string | null = null;

  vm$!: Observable<Vm>;

  private sub = new Subscription();

  constructor(
    private preguntasApi: PreguntasService,
    private bloquesApi: BloquesService,
    private tipoApi: TipoPreguntaService,
    private uploadsApi: UploadsService,
  ) {}

  ngOnInit(): void {
    const tiposState$: Observable<TiposState> = defer(() =>
      from(this.tipoApi.selectOneMenu()),
    ).pipe(
      map((tipos: any) => ({
        loadingTipos: false,
        errorTipos: null,
        tipos: Array.isArray(tipos) ? (tipos as TipoPreguntaMenu[]) : [],
      })),
      startWith({ loadingTipos: true, errorTipos: null, tipos: [] } as TiposState),
      catchError((e: any) =>
        of({
          loadingTipos: false,
          errorTipos: e?.error?.message ?? 'No se pudieron cargar tipos de pregunta.',
          tipos: [],
        } as TiposState),
      ),
      shareReplay(1),
    );

    const selection$ = combineLatest([this.tipoId$, tiposState$]).pipe(
      map(([idTipo, st]) => {
        const tipos = st.tipos || [];
        const tipoSel = tipos.find((x) => Number(x.value) === Number(idTipo || 0)) ?? null;

        const codigoSel = (tipoSel?.codigo || '').toString().toUpperCase();
        const isBloqueSel =
          codigoSel === 'LISTENING' || codigoSel === 'READING' || !!tipoSel?.es_bloque;

        const flags: Flags = {
          showCommon: !!tipoSel,

          isListening: codigoSel === 'LISTENING',
          isReading: codigoSel === 'READING',

          showWriting: codigoSel === 'WRITING',
          showMC: codigoSel === 'MULTIPLE_CHOICE',
          showSpeaking: codigoSel === 'SPEAKING',
          showMatching: codigoSel === 'MATCHING',
          showTrueFalse: codigoSel === 'TRUE_FALSE',
          showFillBlank: codigoSel === 'FILL_BLANK',
          showChooseImage: codigoSel === 'CHOOSE_IMAGE',

          isBloqueSel,
        };

        return { tipoSel, codigoSel, flags };
      }),
      shareReplay(1),
    );

    const uploadState$: Observable<UploadState> = this.uploadTrigger$.pipe(
      switchMap(({ kind, file }) =>
        defer(() => this.uploadsApi.upload(file)).pipe(
          map((r: any) => ({
            uploading: false,
            uploadError: null,
            kind,
            url: String(r?.url ?? '').trim() || null,
          })),
          startWith({ uploading: true, uploadError: null, kind, url: null } as UploadState),
          catchError((e: any) =>
            of({
              uploading: false,
              uploadError: e?.error?.message ?? e?.message ?? 'No se pudo subir el archivo.',
              kind,
              url: null,
            } as UploadState),
          ),
        ),
      ),
      startWith({ uploading: false, uploadError: null, kind: null, url: null } as UploadState),
      shareReplay(1),
    );

    this.sub.add(
      uploadState$
        .pipe(
          filter((u) => !u.uploading && !!u.kind),
          tap((u) => {
            if (u.uploadError) {
              this.ui$.next({ ...this.ui$.value, error: u.uploadError });
              return;
            }
            if (!u.url) {
              this.ui$.next({ ...this.ui$.value, error: 'No se recibió URL del archivo.' });
              return;
            }
            if (u.kind === 'pregunta') this.form.url_multimedia = u.url;
            if (u.kind === 'audio') this.form.url_audio = u.url;
          }),
        )
        .subscribe(),
    );

    this.vm$ = combineLatest([tiposState$, selection$, this.ui$, uploadState$]).pipe(
      map(([tipos, sel, ui, up]) => ({
        ...tipos,
        ...ui,
        ...up,
        tipoSel: sel.tipoSel,
        codigoSel: sel.codigoSel,
        flags: sel.flags,
      })),
      shareReplay(1),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) this.close.emit();
  }

  onTipoSelected(id: any, tipos: TipoPreguntaMenu[] = []) {
    const idNum = Number(id || 0);

    this.ui$.next({ ...this.ui$.value, error: null });
    this.tipoId$.next(idNum);

    this.form.id_tipo_pregunta = idNum;

    const tipo = (tipos || []).find((t) => Number(t.value) === idNum);
    const codigo = (tipo?.codigo || '').toString().toUpperCase();

    this.resetCamposPorTipo(codigo);
  }

  private resetCamposPorTipo(codigo: string) {
    this.form.texto = '';
    this.form.url_multimedia = '';
    this.form.respuesta_esperada = '';
    this.form.texto_base = '';
    this.form.fillBlankSegments = [{ type: 'text', value: '' }];
    this.form.distractores = [];

    this.form.bloque_enunciado = '';
    this.form.url_audio = '';
    this.form.subpreguntas = [];

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
        // el reset general de arriba ya deja fillBlankSegments/distractores listos
        this.form.opcionesRespuesta = [];
        this.form.emparejamientos = [];
        break;

      case 'LISTENING':
      case 'READING':
        this.form.opcionesRespuesta = [];
        this.form.emparejamientos = [];
        this.form.subpreguntas = [];
        break;

      case 'WRITING':
      case 'SPEAKING':
      default:
        this.form.opcionesRespuesta = [];
        this.form.emparejamientos = [];
        break;
    }
  }

  uploadingImgOpcionIndex: number | null = null;

  subirImagenOpcion(iOp: number, file: File | null) {
    if (!file) return;

    this.uploadingImgOpcionIndex = iOp;
    this.ui$.next({ ...this.ui$.value, error: null });

    this.uploadsApi.upload(file).subscribe({
      next: (r: any) => {
        const url = String(r?.url ?? '').trim();
        const op = this.form.opcionesRespuesta?.[iOp];

        if (op && url) {
          op.url_imagen = url;
        }

        this.uploadingImgOpcionIndex = null;
      },
      error: (e: any) => {
        this.uploadingImgOpcionIndex = null;
        this.ui$.next({
          ...this.ui$.value,
          error: e?.error?.message ?? e?.message ?? 'No se pudo subir la imagen.',
        });
      },
    });
  }

  isUploadingImgOpcion(iOp: number): boolean {
    return this.uploadingImgOpcionIndex === iOp;
  }

  onRadioCorrecta(index: number) {
    this.form.opcionesRespuesta.forEach((o, idx) => {
      o.es_correcta = idx === index;
    });
  }

  topTiposDisponibles(tipos: TipoPreguntaMenu[]): TipoPreguntaMenu[] {
    return tipos || [];
  }

  subirMultimediaPregunta(file: File | null) {
    if (!file) return;
    this.ui$.next({ ...this.ui$.value, error: null });
    this.uploadTrigger$.next({ kind: 'pregunta', file });
  }

  subirAudioBloque(file: File | null) {
    if (!file) return;
    this.ui$.next({ ...this.ui$.value, error: null });
    this.uploadTrigger$.next({ kind: 'audio', file });
  }

  // ===== Opciones / pares (pregunta suelta) — MULTIPLE_CHOICE / MATCHING, sin cambios
  addOpcion() {
    this.form.opcionesRespuesta.push({ texto: '', es_correcta: false });
  }
  removeOpcion(i: number) {
    if (this.form.opcionesRespuesta.length <= 2) return;
    this.form.opcionesRespuesta.splice(i, 1);
  }

  addPar() {
    this.form.emparejamientos.push({ izquierda: '', derecha: '' });
  }
  removePar(i: number) {
    if (this.form.emparejamientos.length <= 2) return;
    this.form.emparejamientos.splice(i, 1);
  }

  // ===== FILL_BLANK — segmentos (texto / espacio) =====
  // ✅ Genéricos: sirven igual para form.fillBlankSegments (suelta) y
  // sp.fillBlankSegments (subpregunta), porque reciben el arreglo
  // directamente y lo mutan por referencia.

  private renumerarSegmentos(segs: FillBlankSegment[]) {
    let n = 1;
    for (const s of segs) {
      if (s.type === 'blank') {
        s.numero = String(n);
        n++;
      }
    }
  }

  addEspacioFillBlank(segs: FillBlankSegment[]) {
    segs.push({ type: 'blank', numero: '', respuesta: '' });
    segs.push({ type: 'text', value: '' });
    this.renumerarSegmentos(segs);
  }

  removeEspacioFillBlank(segs: FillBlankSegment[], idx: number) {
    segs.splice(idx, 1);
    this.renumerarSegmentos(segs);
  }

  // ✅ NUEVO: los pedazos de texto ahora son contenteditable plano (no
  // <input>), para que el párrafo haga salto de línea como texto normal
  // en vez de volverse una cajita con scroll horizontal cuando es largo.
  onFbTextInput(seg: { type: 'text'; value: string }, ev: Event) {
    const el = ev.target as HTMLElement;
    const text = (el.innerText ?? '').replace(/\u00A0/g, ' ');
    seg.value = text;

    // Algunos navegadores dejan un <br> residual al borrar todo el texto,
    // lo que rompe el placeholder (CSS :empty). Lo forzamos a quedar
    // realmente vacío para que el placeholder vuelva a mostrarse.
    if (!text) {
      el.innerHTML = '';
    }
  }

  // ✅ Pega siempre como texto plano — evita que se cuele HTML con formato
  // (por ejemplo, si el docente copia desde Word) y corrompa el segmento.
  onFbPaste(ev: ClipboardEvent) {
    ev.preventDefault();
    const text = ev.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  }

  // ===== FILL_BLANK — distractores manuales (pregunta suelta)
  addDistractor() {
    this.form.distractores.push('');
  }

  removeDistractor(i: number) {
    this.form.distractores.splice(i, 1);
  }

  // ===== Subpreguntas (bloque)
  addSubpregunta(tipos: TipoPreguntaMenu[]) {
    const tipoMC = (tipos || []).find(
      (t) => (t.codigo || '').toString().toUpperCase() === 'MULTIPLE_CHOICE',
    );
    this.form.subpreguntas.push({
      id_tipo_pregunta: Number(tipoMC?.value ?? 0),
      texto: '',
      opcionesRespuesta: [
        { texto: '', es_correcta: false },
        { texto: '', es_correcta: false },
      ],
      emparejamientos: [],
      fillBlankSegments: [{ type: 'text', value: '' }],
      distractores: [],
    });
  }

  removeSubpregunta(i: number) {
    if (this.form.subpreguntas.length <= 1) return;
    this.form.subpreguntas.splice(i, 1);
  }

  // ✅ tipos seleccionables como subpregunta (sin bloques, sin WRITING/SPEAKING)
  subTiposDisponibles(tipos: TipoPreguntaMenu[]): TipoPreguntaMenu[] {
    return (tipos || []).filter((t) => {
      if (t.es_bloque) return false;
      const codigo = (t.codigo || '').toString().toUpperCase();
      return codigo !== 'WRITING' && codigo !== 'SPEAKING';
    });
  }

  // ✅ código del tipo elegido para esta subpregunta
  subCodigo(sp: SubPreguntaForm, tipos: TipoPreguntaMenu[]): string {
    const t = (tipos || []).find((x) => Number(x.value) === Number(sp.id_tipo_pregunta || 0));
    return (t?.codigo || '').toString().toUpperCase();
  }

  // ✅ al cambiar el tipo de una subpregunta, resetea sus campos según el tipo
  onSubTipoChange(iSub: number, idTipo: any, tipos: TipoPreguntaMenu[]) {
    const idNum = Number(idTipo || 0);
    const tipo = (tipos || []).find((t) => Number(t.value) === idNum);
    const codigo = (tipo?.codigo || '').toString().toUpperCase();

    const sp = this.form.subpreguntas[iSub];
    if (!sp) return;

    sp.id_tipo_pregunta = idNum;
    sp.fillBlankSegments = [{ type: 'text', value: '' }];
    sp.distractores = [];

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
        // el reset de arriba ya deja fillBlankSegments/distractores listos
        sp.opcionesRespuesta = [];
        sp.emparejamientos = [];
        break;

      default:
        sp.opcionesRespuesta = [];
        sp.emparejamientos = [];
    }
  }

  // ✅ radio "única correcta" para TRUE_FALSE / CHOOSE_IMAGE
  onSubRadioCorrecta(opciones: OpcionForm[], index: number) {
    opciones.forEach((o, idx) => (o.es_correcta = idx === index));
  }

  addSubOpcion(iSub: number) {
    this.form.subpreguntas[iSub].opcionesRespuesta.push({ texto: '', es_correcta: false });
  }

  removeSubOpcion(iSub: number, iOp: number) {
    const ops = this.form.subpreguntas[iSub].opcionesRespuesta;
    if (ops.length <= 2) return;
    ops.splice(iOp, 1);
  }

  // ✅ pares de subpregunta (MATCHING)
  addSubPar(iSub: number) {
    this.form.subpreguntas[iSub].emparejamientos.push({ izquierda: '', derecha: '' });
  }

  removeSubPar(iSub: number, iPar: number) {
    const pares = this.form.subpreguntas[iSub].emparejamientos;
    if (pares.length <= 1) return;
    pares.splice(iPar, 1);
  }

  // ===== FILL_BLANK — distractores manuales (subpregunta)
  addSubDistractor(iSub: number) {
    this.form.subpreguntas[iSub].distractores.push('');
  }

  removeSubDistractor(iSub: number, iDist: number) {
    this.form.subpreguntas[iSub].distractores.splice(iDist, 1);
  }

  // ✅ upload de imagen por opción (CHOOSE_IMAGE), fuera del pipeline vm$
  subirImagenSubOpcion(iSub: number, iOp: number, file: File | null) {
    if (!file) return;
    const key = `${iSub}-${iOp}`;
    this.uploadingImgKey = key;

    this.uploadsApi.upload(file).subscribe({
      next: (r: any) => {
        const url = String(r?.url ?? '').trim();
        const op = this.form.subpreguntas?.[iSub]?.opcionesRespuesta?.[iOp];
        if (op && url) op.url_imagen = url;
        this.uploadingImgKey = null;
      },
      error: () => {
        this.uploadingImgKey = null;
      },
    });
  }

  isUploadingImg(iSub: number, iOp: number): boolean {
    return this.uploadingImgKey === `${iSub}-${iOp}`;
  }

  private validatePreguntaSuelta(tipoSel: TipoPreguntaMenu | null): string | null {
    if (!tipoSel) return 'Tipo inválido.';

    const codigo = (tipoSel.codigo || '').toString().toUpperCase();

    // ✅ chequeo de espacios sin respuesta ANTES de construir el payload
    if (codigo === 'FILL_BLANK') {
      const errEspacios = this.preguntasApi.validarEspaciosCompletos(this.form);
      if (errEspacios) return errEspacios;
    }

    const payload = this.preguntasApi.buildPayload(this.form, tipoSel);
    return this.preguntasApi.validatePayload(payload, tipoSel);
  }

  // ✅ cada subpregunta se valida según su propio tipo (no solo MC)
  private validateBloque(
    flags: Flags,
    tipoSel: TipoPreguntaMenu | null,
    tipos: TipoPreguntaMenu[],
  ): string | null {
    if (!tipoSel) return 'Tipo inválido.';
    if (!this.form.bloque_enunciado.trim()) return 'Escribe el enunciado del bloque.';

    if (flags.isListening && !this.form.url_audio.trim()) return 'LISTENING requiere un audio.';
    if (flags.isReading && !this.form.texto_base.trim()) return 'READING requiere el texto base.';

    const subs = this.form.subpreguntas || [];
    if (subs.length < 1) return 'Agrega al menos 1 subpregunta.';

    for (let i = 0; i < subs.length; i++) {
      const s = subs[i];
      if (!String(s.texto || '').trim()) return `Subpregunta ${i + 1}: escribe el enunciado.`;

      const tipoSub = tipos.find((t) => Number(t.value) === Number(s.id_tipo_pregunta));
      if (!tipoSub) return `Subpregunta ${i + 1}: selecciona un tipo.`;

      const codigoSub = (tipoSub.codigo || '').toString().toUpperCase();

      // ✅ FIX: apunta a bloquesApi (antes apuntaba a preguntasApi por error
      // de copiar/pegar — funcionaba igual porque el método es puro, pero
      // quedaba duplicado en dos servicios sin necesidad).
      if (codigoSub === 'FILL_BLANK') {
        const errEspacios = this.bloquesApi.validarEspaciosCompletos(s as any);
        if (errEspacios) return `Subpregunta ${i + 1}: ${errEspacios}`;
      }

      const payloadSub = this.bloquesApi.buildSubpreguntaPayload(s, tipoSub);
      const err = this.bloquesApi.validateSubpreguntaPayload(payloadSub, tipoSub);
      if (err) return `Subpregunta ${i + 1}: ${err}`;
    }

    return null;
  }

  async submit(vm: Vm) {
    this.ui$.next({ ...this.ui$.value, saving: true, error: null });

    try {
      if (!this.form.id_tipo_pregunta) throw new Error('Selecciona el tipo de pregunta.');
      if (!vm.tipoSel) throw new Error('Tipo inválido.');

      if (vm.flags.isBloqueSel && (this.form.subpreguntas?.length ?? 0) === 0) {
        this.addSubpregunta(vm.tipos);
      }

      // ✅ Pregunta suelta
      if (!vm.flags.isBloqueSel) {
        const localErr = this.validatePreguntaSuelta(vm.tipoSel);
        if (localErr) throw new Error(localErr);

        const payload = this.preguntasApi.buildPayload(this.form, vm.tipoSel);

        await this.preguntasApi.crearEnEvaluacion(Number(this.idEvaluacion), payload);
        this.created.emit();
        return;
      }

      // ✅ Bloque
      const errB = this.validateBloque(vm.flags, vm.tipoSel, vm.tipos);
      if (errB) throw new Error(errB);

      const bloquePayload: any = {
        id_tipo_pregunta: Number(this.form.id_tipo_pregunta),
        enunciado: this.form.bloque_enunciado.trim(),
      };

      if (vm.flags.isListening) bloquePayload.url_audio = this.form.url_audio.trim();
      if (vm.flags.isReading) bloquePayload.texto_base = this.form.texto_base.trim();

      const bloque = await this.bloquesApi.crearEnEvaluacion(
        Number(this.idEvaluacion),
        bloquePayload,
      );
      const id_bloque = Number(bloque?.id_bloque);
      if (!id_bloque) throw new Error('No se pudo obtener el id del bloque creado.');

      for (const s of this.form.subpreguntas) {
        const tipoSub = vm.tipos.find((t) => Number(t.value) === Number(s.id_tipo_pregunta));
        if (!tipoSub) throw new Error('Selecciona el tipo para cada subpregunta.');

        const payloadSub = this.bloquesApi.buildSubpreguntaPayload(s, tipoSub);
        const errSub = this.bloquesApi.validateSubpreguntaPayload(payloadSub, tipoSub);
        if (errSub) throw new Error(errSub);

        await this.bloquesApi.crearSubpreguntaMC(id_bloque, payloadSub);
      }

      this.created.emit();
    } catch (e: any) {
      this.ui$.next({
        ...this.ui$.value,
        error: e?.error?.message ?? e?.message ?? 'No se pudo crear.',
      });
    } finally {
      this.ui$.next({ ...this.ui$.value, saving: false });
    }
  }
}
