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

import { PreguntasService } from '../../../../services/preguntas.service';
import { BloquesService } from '../../../../services/bloques.service';
import { TipoPreguntaService, TipoPreguntaMenu } from '../../../../services/tipo-pregunta.service';
import { UploadsService } from '../../../../services/uploads.service';

type OpcionForm = { texto: string; es_correcta: boolean };
type ParForm = { izquierda: string; derecha: string };

type SubPreguntaForm = {
  texto: string;
  opcionesRespuesta: OpcionForm[];
};

type CodigoTipo = 'WRITING' | 'MULTIPLE_CHOICE' | 'SPEAKING' | 'LISTENING' | 'MATCHING' | 'READING';

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

  // ✅ Form local (ngModel)
  // (Esto NO es "estado async" — lo async (loading/error/upload/saving) va en vm$)
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

    // MATCHING
    emparejamientos: [
      { izquierda: '', derecha: '' },
      { izquierda: '', derecha: '' },
    ] as ParForm[],

    // BLOQUE
    bloque_enunciado: '',
    url_audio: '', // LISTENING
    texto_base: '', // READING
    subpreguntas: [] as SubPreguntaForm[],
  };

  // ===== Streams de estado (patrón vm$)
  private ui$ = new BehaviorSubject<UiState>({ saving: false, error: null });

  private tipoId$ = new BehaviorSubject<number>(0);

  private uploadTrigger$ = new Subject<{ kind: UploadKind; file: File }>();

  // ✅ vm$
  vm$!: Observable<Vm>;

  private sub = new Subscription();

  constructor(
    private preguntasApi: PreguntasService,
    private bloquesApi: BloquesService,
    private tipoApi: TipoPreguntaService,
    private uploadsApi: UploadsService,
  ) {}

  ngOnInit(): void {
    // ====== Tipos de pregunta (defer + from + startWith + catchError + shareReplay)
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

    // ====== Selección derivada (sin funciones en template)
    const selection$ = combineLatest([this.tipoId$, tiposState$]).pipe(
      map(([idTipo, st]) => {
        const tipos = st.tipos || [];
        const tipoSel = tipos.find((x) => Number(x.value) === Number(idTipo || 0)) ?? null;

        const codigoSel = (tipoSel?.codigo as any) || '';
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
          isBloqueSel,
        };

        return { tipoSel, codigoSel, flags };
      }),
      shareReplay(1),
    );

    // ====== Upload state (stream controlado, sin booleans mutados “a mano”)
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

    // ✅ Aplicar URL al form SOLO cuando hay éxito (sin setTimeout, sin detectChanges)
    this.sub.add(
      uploadState$
        .pipe(
          filter((u) => !u.uploading && !!u.kind),
          tap((u) => {
            // si hubo error, lo ponemos en ui.error (dentro del stream)
            if (u.uploadError) {
              this.ui$.next({ ...this.ui$.value, error: u.uploadError });
              return;
            }
            // si no hay url válida, también error
            if (!u.url) {
              this.ui$.next({ ...this.ui$.value, error: 'No se recibió URL del archivo.' });
              return;
            }
            // éxito -> setear campo correspondiente
            if (u.kind === 'pregunta') this.form.url_multimedia = u.url;
            if (u.kind === 'audio') this.form.url_audio = u.url;
          }),
        )
        .subscribe(),
    );

    // ====== vm$
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

  // ✅ Evento de selección (sin calcular flags en template)
  onTipoSelected(id: any) {
    const idNum = Number(id || 0);

    // limpiar error UI al cambiar tipo
    this.ui$.next({ ...this.ui$.value, error: null });

    // actualizar subject
    this.tipoId$.next(idNum);

    // reset del form al cambiar tipo (sin depender del template)
    this.form.id_tipo_pregunta = idNum;

    this.form.texto = '';
    this.form.url_multimedia = '';
    this.form.respuesta_esperada = '';
    this.form.opcionesRespuesta = [
      { texto: '', es_correcta: false },
      { texto: '', es_correcta: false },
    ];
    this.form.emparejamientos = [
      { izquierda: '', derecha: '' },
      { izquierda: '', derecha: '' },
    ];

    this.form.bloque_enunciado = '';
    this.form.url_audio = '';
    this.form.texto_base = '';
    this.form.subpreguntas = [];

    // NOTA: agregar subpregunta inicial lo hacemos al submit/validación;
    // o si quieres aquí, lo hacemos pero sin depender de flags del template:
    // Para no duplicar lógica, lo decidimos al submit usando vm.flags.
  }

  // ===== Upload triggers (no mutar uploading aquí)
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

  // ===== Helpers de form
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

  addSubpregunta() {
    this.form.subpreguntas.push({
      texto: '',
      opcionesRespuesta: [
        { texto: '', es_correcta: false },
        { texto: '', es_correcta: false },
      ],
    });
  }

  removeSubpregunta(i: number) {
    if (this.form.subpreguntas.length <= 1) return;
    this.form.subpreguntas.splice(i, 1);
  }

  addSubOpcion(iSub: number) {
    this.form.subpreguntas[iSub].opcionesRespuesta.push({ texto: '', es_correcta: false });
  }

  removeSubOpcion(iSub: number, iOp: number) {
    const ops = this.form.subpreguntas[iSub].opcionesRespuesta;
    if (ops.length <= 2) return;
    ops.splice(iOp, 1);
  }

  private validatePreguntaSuelta(flags: Flags, tipoSel: TipoPreguntaMenu | null): string | null {
    if (!this.form.texto.trim()) return 'Escribe el enunciado.';
    if (!tipoSel) return 'Tipo inválido.';

    if (flags.showMC) {
      const ops = (this.form.opcionesRespuesta || [])
        .map((o) => ({ texto: (o.texto || '').trim(), es_correcta: !!o.es_correcta }))
        .filter((o) => o.texto.length > 0);

      if (ops.length < 2) return 'Agrega mínimo 2 opciones.';
      if (!ops.some((o) => o.es_correcta)) return 'Marca al menos una opción correcta.';
    }

    if (flags.showMatching) {
      const pares = (this.form.emparejamientos || [])
        .map((p) => ({ izquierda: (p.izquierda || '').trim(), derecha: (p.derecha || '').trim() }))
        .filter((p) => p.izquierda.length > 0 && p.derecha.length > 0);

      if (pares.length < 2) return 'Agrega mínimo 2 pares para unir.';
    }

    return null;
  }

  private validateBloque(flags: Flags, tipoSel: TipoPreguntaMenu | null): string | null {
    if (!tipoSel) return 'Tipo inválido.';
    if (!this.form.bloque_enunciado.trim()) return 'Escribe el enunciado del bloque.';

    if (flags.isListening && !this.form.url_audio.trim()) return 'LISTENING requiere un audio.';
    if (flags.isReading && !this.form.texto_base.trim()) return 'READING requiere el texto base.';

    const subs = this.form.subpreguntas || [];
    if (subs.length < 1) return 'Agrega al menos 1 subpregunta.';

    for (let i = 0; i < subs.length; i++) {
      const s = subs[i];
      if (!String(s.texto || '').trim()) return `Subpregunta ${i + 1}: escribe el enunciado.`;

      const ops = (s.opcionesRespuesta || [])
        .map((o) => ({ texto: (o.texto || '').trim(), es_correcta: !!o.es_correcta }))
        .filter((o) => o.texto.length > 0);

      if (ops.length < 2) return `Subpregunta ${i + 1}: agrega mínimo 2 opciones.`;
      if (!ops.some((o) => o.es_correcta)) return `Subpregunta ${i + 1}: marca una correcta.`;
    }

    return null;
  }

  async submit(vm: Vm) {
    // ✅ todo el estado async se mueve a ui$
    this.ui$.next({ ...this.ui$.value, saving: true, error: null });

    try {
      if (!this.form.id_tipo_pregunta) throw new Error('Selecciona el tipo de pregunta.');
      if (!vm.tipoSel) throw new Error('Tipo inválido.');

      // Si es bloque y no tiene subpreguntas, metemos una por defecto
      if (vm.flags.isBloqueSel && (this.form.subpreguntas?.length ?? 0) === 0) {
        this.addSubpregunta();
      }

      // ✅ Pregunta suelta
      if (!vm.flags.isBloqueSel) {
        const localErr = this.validatePreguntaSuelta(vm.flags, vm.tipoSel);
        if (localErr) throw new Error(localErr);

        const payload = this.preguntasApi.buildPayload(this.form, vm.tipoSel);
        const err = this.preguntasApi.validatePayload(payload, vm.tipoSel);
        if (err) throw new Error(err);

        await this.preguntasApi.crearEnEvaluacion(Number(this.idEvaluacion), payload);
        this.created.emit();
        return;
      }

      // ✅ Bloque
      const errB = this.validateBloque(vm.flags, vm.tipoSel);
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
        const payloadSub: any = { texto: String(s.texto || '').trim() };

        payloadSub.opcionesRespuesta = (s.opcionesRespuesta || [])
          .map((o) => ({ texto: (o.texto || '').trim(), es_correcta: !!o.es_correcta }))
          .filter((o) => o.texto.length > 0);

        const errSub = this.bloquesApi.validateSubpreguntaPayload(payloadSub, true);
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
