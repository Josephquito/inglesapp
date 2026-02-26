import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  firstValueFrom,
  BehaviorSubject,
  Observable,
  Subject,
  combineLatest,
  defer,
  from,
  interval,
  of,
} from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  groupBy,
  map,
  mergeMap,
  shareReplay,
  startWith,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs/operators';

import { RendicionesService } from '../../services/rendiciones.service';
import { AuthService } from '../../services/auth.service';
import { UploadsService } from '../../services/uploads.service';

import { RendirPreguntaComponent } from '../../shared/components/rendir-pregunta/rendir-pregunta.component';
import { ConfirmarFinalizarModalComponent } from '../../shared/modales/confirmar-finalizar/confirmar-finalizar.modal';
import { ProctoringWarnModalComponent } from '../../shared/modales/rendir-evaluacion/proctoring-warn/proctoring-warn.modal';

type SaveState = { saving?: boolean; savedAt?: string; error?: string };

type FlatItem =
  | { kind: 'PREGUNTA'; id_pregunta: number; pregunta: any }
  | { kind: 'SUBPREGUNTA'; id_pregunta: number; pregunta: any; bloque: any };

type ProctoringMotivo = 'NO_FACE' | 'TAB_SWITCH' | 'WINDOW_BLUR';

type UiState = {
  showFinalizarModal: boolean;
  showWarnModal: boolean;
  finalizando: boolean;
  entregadoConExito: boolean;
  errorMessage: string;

  currentIndex: number;
  timerText: string;

  // proctoring
  proctoringRequired: boolean;
  proctoringReady: boolean;
  proctoringError: string;
  warnings: number;
  suspended: boolean;

  // curso
  id_curso_seguro: number | null;
};

type DataState = {
  perfil: any | null;
  evaluacion: any | null;
  intento: any | null;
  preguntasSueltas: any[];
  bloques: any[];
  flatPreguntas: FlatItem[];
  resultado: any | null;
  respuestasLocal: Record<number, any>;
  saveState: Record<number, SaveState>;
};

type Vm = {
  loading: boolean;
  errorMessage: string;

  id_intento: number;
  id_curso_seguro: number | null;

  evaluacion: any | null;
  intento: any | null;
  perfil: any | null;

  titulo: string;

  timerText: string;
  tieneTiempo: boolean;
  timerDanger: boolean;

  total: number;
  currentIndex: number;
  isFirst: boolean;
  isLast: boolean;

  currentPregunta: any | null;
  currentBloque: any | null;

  entregadoConExito: boolean;
  finalizando: boolean;
  showFinalizarModal: boolean;
  showWarnModal: boolean;
  resultado: any | null;

  proctoringRequired: boolean;
  proctoringReady: boolean;
  proctoringError: string;
  warnings: number;
  suspended: boolean;

  jump: { i: number; label: number; current: boolean; answered: boolean }[];
};

@Component({
  selector: 'app-rendir-evaluacion-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RendirPreguntaComponent,
    ConfirmarFinalizarModalComponent,
    ProctoringWarnModalComponent,
  ],
  templateUrl: './rendir-evaluacion.page.html',
  styleUrls: ['./rendir-evaluacion.page.css'],
})
export class RendirEvaluacionPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // ✅ streams de ruta (se crean en constructor para no TS2729)
  private idIntento$!: Observable<number>;
  private cursoSeguro$!: Observable<number | null>;

  // UI/Data state (para vm$)
  private ui$ = new BehaviorSubject<UiState>({
    showFinalizarModal: false,
    showWarnModal: false,
    finalizando: false,
    entregadoConExito: false,
    errorMessage: '',
    currentIndex: 0,
    timerText: '—:—:—',
    proctoringRequired: false,
    proctoringReady: false,
    proctoringError: '',
    warnings: 0,
    suspended: false,
    id_curso_seguro: null,
  });

  private data$ = new BehaviorSubject<DataState>({
    perfil: null,
    evaluacion: null,
    intento: null,
    preguntasSueltas: [],
    bloques: [],
    flatPreguntas: [],
    resultado: null,
    respuestasLocal: {},
    saveState: {},
  });

  // autosave sin setTimeout (Rx)
  private saveReq$ = new Subject<{ idp: number }>();

  // proctoring runtime
  private mediaStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  private isUploadingProctoring = false;
  private isStoppingRecorder = false;

  vm$!: Observable<Vm>;

  private onVisChange = () => {
    const ui = this.ui$.value;
    if (!ui.proctoringRequired || ui.entregadoConExito || ui.suspended) return;
    if (document.hidden) void this.sendWarn('TAB_SWITCH');
  };

  private onBlur = () => {
    const ui = this.ui$.value;
    if (!ui.proctoringRequired || ui.entregadoConExito || ui.suspended) return;
    void this.sendWarn('WINDOW_BLUR');
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: RendicionesService,
    private authApi: AuthService,
    private uploads: UploadsService,
  ) {
    this.idIntento$ = this.route.paramMap.pipe(
      map((pm) => Number(pm.get('id_intento') || 0)),
      distinctUntilChanged(),
      shareReplay(1),
    );

    this.cursoSeguro$ = this.route.queryParamMap.pipe(
      map((qp) => {
        const cursoId = qp.get('curso');
        return cursoId ? Number(cursoId) : null;
      }),
      startWith(null),
      shareReplay(1),
    );
  }

  ngOnInit() {
    // ✅ mantener curso seguro por queryparam
    this.cursoSeguro$
      .pipe(
        tap((c) => {
          if (c) this.ui$.next({ ...this.ui$.value, id_curso_seguro: c });
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    // ✅ cargar intento + preguntas (defer/from/startWith/catchError/shareReplay)
    const load$ = this.idIntento$.pipe(
      switchMap((id_intento) => {
        if (!id_intento) {
          return of({ loading: false, error: 'ID de intento inválido.', payload: null as any });
        }

        return defer(() =>
          from(
            (async () => {
              const perfil = await this.authApi.getPerfil();
              const data = await this.api.obtenerPreguntasIntento(id_intento);
              return { id_intento, perfil, data };
            })(),
          ),
        ).pipe(
          map((payload) => ({ loading: false, error: '', payload })),
          startWith({ loading: true, error: '', payload: null }),
          catchError((e: any) =>
            of({
              loading: false,
              error: e?.error?.message ?? 'No se pudo cargar la rendición.',
              payload: null,
            }),
          ),
        );
      }),
      shareReplay(1),
    );

    // ✅ aplicar load a state (sin detectChanges)
    load$
      .pipe(
        filter((s) => !s.loading),
        tap((s) => {
          if (s.error) {
            this.ui$.next({ ...this.ui$.value, errorMessage: s.error });
            return;
          }

          const { id_intento, perfil, data } = s.payload;

          const evaluacion = data?.evaluacion ?? null;
          const intento = data?.intento ?? null;

          const preguntasSueltas = Array.isArray(data?.preguntas_sueltas)
            ? data.preguntas_sueltas
            : [];
          const bloques = Array.isArray(data?.bloques) ? data.bloques : [];

          const flatPreguntas = this.buildFlat(preguntasSueltas, bloques);
          const respuestasLocal = this.hydrateLocalFromBackend(flatPreguntas);

          const idCursoApi = evaluacion?.id_curso || intento?.id_curso || data?.id_curso;

          this.data$.next({
            ...this.data$.value,
            perfil,
            evaluacion,
            intento,
            preguntasSueltas,
            bloques,
            flatPreguntas,
            respuestasLocal,
            saveState: {},
            resultado: null,
          });

          this.ui$.next({
            ...this.ui$.value,
            errorMessage: '',
            currentIndex: 0,
            showFinalizarModal: false,
            finalizando: false,
            entregadoConExito: false,
            suspended: false,
            warnings: 0,
            proctoringRequired: !!evaluacion?.usa_camara,
            proctoringReady: false,
            proctoringError: '',
            id_curso_seguro:
              this.ui$.value.id_curso_seguro ?? (idCursoApi ? Number(idCursoApi) : null),
          });

          const estado = (intento?.estado ?? '').toString().toUpperCase();
          if (estado && estado !== 'EN_PROGRESO') {
            // ya entregado → cargar resultado
            this.ui$.next({ ...this.ui$.value, entregadoConExito: true });
            void this.loadResultado();
          } else {
            // igual que tu código viejo: si requiere cámara, intenta iniciar (esto dispara permisos)
            if (this.ui$.value.proctoringRequired) {
              void this.ensureProctoringStarted();
            }
          }
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    // ✅ timer sin setInterval (Rx)
    combineLatest([this.data$, interval(1000).pipe(startWith(0))])
      .pipe(
        map(([data]) => {
          const fin = data?.intento?.fin_programado ? new Date(data.intento.fin_programado) : null;
          if (!fin) return '—:—:—';

          const diff = fin.getTime() - new Date().getTime();
          if (diff <= 0) return '00:00:00';

          const totalSec = Math.floor(diff / 1000);
          const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
          const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
          const ss = String(totalSec % 60).padStart(2, '0');
          return `${hh}:${mm}:${ss}`;
        }),
        distinctUntilChanged(),
        tap((t) => {
          this.ui$.next({ ...this.ui$.value, timerText: t });
          if (t === '00:00:00') {
            const ui = this.ui$.value;
            if (!ui.entregadoConExito && !ui.finalizando && !ui.suspended) void this.finalizar();
          }
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    // ✅ autosave sin setTimeout: groupBy(idp) + debounceTime
    this.saveReq$
      .pipe(
        groupBy((x) => x.idp),
        mergeMap((g$) =>
          g$.pipe(
            debounceTime(500),
            switchMap(({ idp }) => defer(() => from(this.doSave(idp)))),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe();

    // ✅ vm$ (lo que consume el template)
    this.vm$ = combineLatest([load$, this.ui$, this.data$]).pipe(
      map(([load, ui, data]) => {
        const total = data.flatPreguntas.length;
        const currentIndex = Math.min(ui.currentIndex, Math.max(total - 1, 0));
        const isFirst = currentIndex === 0;
        const isLast = total > 0 ? currentIndex === total - 1 : true;

        const item = data.flatPreguntas[currentIndex];
        const p = item?.pregunta ?? null;
        const currentPregunta = p ? { ...p, ...(data.respuestasLocal[p.id_pregunta] ?? {}) } : null;
        const currentBloque = item?.kind === 'SUBPREGUNTA' ? (item as any).bloque : null;

        const titulo = data?.evaluacion?.titulo ? String(data.evaluacion.titulo) : 'Cargando...';
        const tieneTiempo = !!data?.evaluacion?.tiene_tiempo;
        const timerDanger = ui.timerText.startsWith('00:0');

        const jump = (data.flatPreguntas || []).map((_, i) => {
          const pr = data.flatPreguntas[i]?.pregunta;
          const local = pr ? data.respuestasLocal[pr.id_pregunta] : null;
          const answered = !!(
            local?.respuesta_texto ||
            local?.id_opcion ||
            (local?.respuesta_matching?.length ?? 0) ||
            local?.url_audio
          );
          return { i, label: i + 1, current: i === currentIndex, answered };
        });

        return {
          loading: !!load.loading,
          errorMessage: ui.errorMessage || (load.error ?? ''),

          id_intento: data?.intento?.id_intento ?? 0,
          id_curso_seguro: ui.id_curso_seguro,

          evaluacion: data.evaluacion,
          intento: data.intento,
          perfil: data.perfil,

          titulo,

          timerText: ui.timerText,
          tieneTiempo,
          timerDanger,

          total,
          currentIndex,
          isFirst,
          isLast,

          currentPregunta,
          currentBloque,

          entregadoConExito: ui.entregadoConExito,
          finalizando: ui.finalizando,
          showFinalizarModal: ui.showFinalizarModal,

          // ⚠️ ESTA ES LA LÍNEA QUE FALTABA:
          showWarnModal: ui.showWarnModal,

          resultado: data.resultado,

          proctoringRequired: ui.proctoringRequired,
          proctoringReady: ui.proctoringReady,
          proctoringError: ui.proctoringError,
          warnings: ui.warnings,
          suspended: ui.suspended,

          jump,
        } as Vm;
      }),
      shareReplay(1),
    );
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    this.detachProctoringGuards();
    void this.safeStopRecording();
    this.stopCamera();
  }

  // =========================
  // navegación (sin getters)
  // =========================
  prev() {
    const ui = this.ui$.value;
    if (ui.currentIndex > 0) this.ui$.next({ ...ui, currentIndex: ui.currentIndex - 1 });
  }

  next() {
    const ui = this.ui$.value;
    const total = this.data$.value.flatPreguntas.length;
    if (ui.currentIndex < total - 1) this.ui$.next({ ...ui, currentIndex: ui.currentIndex + 1 });
  }

  goTo(i: number) {
    const total = this.data$.value.flatPreguntas.length;
    if (i < 0 || i >= total) return;
    this.ui$.next({ ...this.ui$.value, currentIndex: i });
  }

  // =========================
  // respuestas + autosave
  // =========================
  onSavePregunta(payload: any) {
    const ui = this.ui$.value;
    if (ui.suspended) return;

    const data = this.data$.value;
    const item = data.flatPreguntas[ui.currentIndex];
    const idp = item?.pregunta?.id_pregunta;
    if (!idp) return;

    const respuestasLocal = {
      ...data.respuestasLocal,
      [idp]: { ...(data.respuestasLocal[idp] ?? {}), ...payload },
    };
    const saveState = { ...data.saveState, [idp]: { saving: true } };

    this.data$.next({ ...data, respuestasLocal, saveState });

    // debounce Rx
    this.saveReq$.next({ idp });
  }

  private async doSave(idp: number) {
    const ui = this.ui$.value;
    if (ui.suspended) return;

    const data = this.data$.value;
    const id_intento = data?.intento?.id_intento ?? 0;
    if (!id_intento) return;

    try {
      await this.api.autosaveRespuesta(id_intento, idp, data.respuestasLocal[idp]);

      const saveState = {
        ...this.data$.value.saveState,
        [idp]: { saving: false, savedAt: new Date().toISOString() },
      };
      this.data$.next({ ...this.data$.value, saveState });
    } catch (e: any) {
      const msg = e?.error?.message ?? '';
      if (msg.toLowerCase().includes('suspend')) {
        this.ui$.next({ ...this.ui$.value, suspended: true, errorMessage: msg });
      } else {
        const saveState = {
          ...this.data$.value.saveState,
          [idp]: { saving: false, error: 'Error al guardar' },
        };
        this.data$.next({ ...this.data$.value, saveState });
      }
    }
  }

  getState(id: number | null | undefined) {
    if (!id) return {};
    return this.data$.value.saveState[id] || {};
  }

  // =========================
  // finalizar / resultado
  // =========================
  openFinalizarModal() {
    this.ui$.next({ ...this.ui$.value, showFinalizarModal: true });
  }

  closeFinalizarModal() {
    this.ui$.next({ ...this.ui$.value, showFinalizarModal: false });
  }

  async finalizar() {
    const ui = this.ui$.value;
    if (ui.suspended) {
      this.ui$.next({
        ...ui,
        errorMessage: 'Intento suspendido. No puedes finalizar.',
        showFinalizarModal: false,
      });
      return;
    }

    this.ui$.next({ ...ui, finalizando: true, showFinalizarModal: false, errorMessage: '' });

    try {
      if (ui.proctoringRequired) {
        await this.uploadProctoringVideo();
        this.detachProctoringGuards();
      }

      const id_intento = this.data$.value?.intento?.id_intento ?? 0;
      await this.api.finalizarIntento(id_intento);

      await this.loadResultado();
      this.ui$.next({ ...this.ui$.value, entregadoConExito: true });
    } catch (e: any) {
      this.ui$.next({
        ...this.ui$.value,
        errorMessage: e?.error?.message ?? e?.message ?? 'Error al finalizar.',
      });
    } finally {
      this.ui$.next({ ...this.ui$.value, finalizando: false });
    }
  }

  private async loadResultado() {
    const id_intento = this.data$.value?.intento?.id_intento ?? 0;
    if (!id_intento) return;

    try {
      const resultado = await this.api.verResultado(id_intento);

      // set curso seguro si viene y aún no hay
      if (resultado?.id_curso && !this.ui$.value.id_curso_seguro) {
        this.ui$.next({ ...this.ui$.value, id_curso_seguro: Number(resultado.id_curso) });
      }

      this.data$.next({ ...this.data$.value, resultado });
    } catch {
      this.data$.next({ ...this.data$.value, resultado: null });
    }
  }

  irAlInicio() {
    const id_curso = this.ui$.value.id_curso_seguro;
    if (id_curso) this.router.navigate(['/curso', id_curso]);
    else this.router.navigate(['/mis-cursos']);
  }

  // =========================
  // build/hydrate (igual que tu código)
  // =========================
  private buildFlat(preguntasSueltas: any[], bloques: any[]): FlatItem[] {
    const arr: FlatItem[] = [];

    for (const p of preguntasSueltas || []) {
      if (!p?.id_pregunta) continue;
      arr.push({ kind: 'PREGUNTA', id_pregunta: p.id_pregunta, pregunta: p });
    }

    for (const b of bloques || []) {
      // ✅ IMPORTANTE: igual que tu código viejo (b.preguntas)
      // si tu API usa otra key (subpreguntas), aquí se ajusta.
      const lista = Array.isArray(b?.preguntas) ? b.preguntas : [];
      for (const p of lista) {
        if (!p?.id_pregunta) continue;
        arr.push({ kind: 'SUBPREGUNTA', id_pregunta: p.id_pregunta, pregunta: p, bloque: b });
      }
    }

    return arr;
  }

  private hydrateLocalFromBackend(flat: FlatItem[]) {
    const out: Record<number, any> = {};
    for (const item of flat) {
      const p = item?.pregunta;
      if (!p?.id_pregunta) continue;

      out[p.id_pregunta] = {
        respuesta_texto: p.respuesta_texto,
        id_opcion: p.id_opcion,
        respuesta_matching: p.respuesta_matching,
        url_audio: p.url_audio,
      };
    }
    return out;
  }

  // =========================
  // PROCTORING (igual que tu código)
  // =========================
  async ensureProctoringStarted() {
    if (!this.ui$.value.proctoringRequired) return;

    this.ui$.next({ ...this.ui$.value, proctoringError: '', proctoringReady: false });

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador no soporta cámara para proctoring.');
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      const id_intento = this.data$.value?.intento?.id_intento ?? 0;
      await this.api.iniciarProctoring(id_intento);

      this.startRecording(this.mediaStream);

      this.ui$.next({ ...this.ui$.value, proctoringReady: true });
      this.attachProctoringGuards();
    } catch (e: any) {
      const msg =
        e?.name === 'NotAllowedError'
          ? 'Debes permitir acceso a cámara y micrófono para rendir esta evaluación.'
          : (e?.message ?? 'No se pudo iniciar la cámara.');
      this.ui$.next({ ...this.ui$.value, proctoringError: msg, proctoringReady: false });
    }
  }

  private startRecording(stream: MediaStream) {
    this.chunks = [];
    const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

    let opts: MediaRecorderOptions = {};
    const supported = candidates.find((m) => MediaRecorder.isTypeSupported(m));
    if (supported) opts = { mimeType: supported };

    this.recorder = new MediaRecorder(stream, opts);

    this.recorder.ondataavailable = (ev: BlobEvent) => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data);
    };

    this.recorder.start(1000);
  }

  private async safeStopRecording(): Promise<Blob | null> {
    if (!this.recorder) return null;
    if (this.isStoppingRecorder) return null;
    this.isStoppingRecorder = true;

    try {
      return await this.stopRecording();
    } finally {
      this.isStoppingRecorder = false;
    }
  }

  private async stopRecording(): Promise<Blob | null> {
    if (!this.recorder) return null;

    const recorder = this.recorder;

    return await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'video/webm' });
        this.recorder = null;
        this.chunks = [];
        resolve(blob.size > 0 ? blob : null);
      };

      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });
  }

  private stopCamera() {
    if (!this.mediaStream) return;
    for (const t of this.mediaStream.getTracks()) t.stop();
    this.mediaStream = null;
  }

  private async uploadProctoringVideo() {
    if (!this.ui$.value.proctoringRequired) return;
    if (!this.ui$.value.proctoringReady) throw new Error('Debes activar la cámara para finalizar.');
    if (this.isUploadingProctoring) return;

    this.isUploadingProctoring = true;
    try {
      const blob = await this.safeStopRecording();
      this.stopCamera();

      if (!blob) throw new Error('No se pudo generar el video de la cámara.');

      const id_intento = this.data$.value?.intento?.id_intento ?? 0;

      const file = new File([blob], `proctoring_${id_intento}.webm`, { type: 'video/webm' });

      const resp = await firstValueFrom(this.uploads.upload(file, { intentoId: id_intento }));
      const url = (resp?.url ?? '').toString().trim();
      if (!url) throw new Error('No se recibió URL del video.');

      await this.api.guardarVideoProctoring(id_intento, url);
    } finally {
      this.isUploadingProctoring = false;
    }
  }

  private attachProctoringGuards() {
    document.addEventListener('visibilitychange', this.onVisChange);
    window.addEventListener('blur', this.onBlur);
  }

  private detachProctoringGuards() {
    document.removeEventListener('visibilitychange', this.onVisChange);
    window.removeEventListener('blur', this.onBlur);
  }

  private async sendWarn(motivo: ProctoringMotivo) {
    const currentUi = this.ui$.value;
    if (currentUi.suspended || currentUi.showWarnModal) return;

    try {
      const id_intento = this.data$.value?.intento?.id_intento ?? 0;
      const resp = await this.api.registrarWarningFraude(id_intento, motivo);

      const warnings = Number(resp?.warnings ?? currentUi.warnings + 1);

      if (resp?.suspendido) {
        // 1. Marcamos como suspendido y cerramos cualquier modal de aviso
        this.ui$.next({
          ...this.ui$.value,
          warnings,
          suspended: true,
          showWarnModal: false,
          errorMessage: 'Examen suspendido por fraude (3 avisos).',
        });

        // 2. Detenemos seguridad y cámara
        this.detachProctoringGuards();
        await this.safeStopRecording();
        this.stopCamera();

        // 3. 🚀 REDIRECCIÓN AUTOMÁTICA A RESULTADOS
        // Ejecutamos la carga del resultado directamente
        await this.loadResultado();

        // Marcamos como entregado para que el HTML muestre la pestaña de nota final
        this.ui$.next({
          ...this.ui$.value,
          entregadoConExito: true,
          finalizando: false,
        });
      } else {
        this.ui$.next({ ...this.ui$.value, warnings, showWarnModal: true });
      }
    } catch (err) {
      console.error('Error registrando fraude:', err);
    }
  }

  closeWarnModal() {
    this.ui$.next({
      ...this.ui$.value,
      showWarnModal: false,
    });
  }
}
