import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Observable, of, defer, from, Subject, combineLatest } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { EvaluacionesService } from '../../services/evaluaciones.service';
import { PreguntasService } from '../../services/preguntas.service';
import { TipoPreguntaService, TipoPreguntaMenu } from '../../services/tipo-pregunta.service';
import { AuthService } from '../../services/auth.service';
import { BloquesService } from '../../services/bloques.service';
import { IntentosMejorTableComponent } from '../../shared/components/intentos-mejor-table/intentos-mejor-table.component';
import { RevisionIntentoModalComponent } from '../../shared/modales/rendiciones/revision-intento/revision-intento.modal';
import { RendicionesService } from '../../services/rendiciones.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { CursosService } from '../../services/cursos.service';

import { PreguntasTableComponent } from '../../shared/components/preguntas-table/preguntas-table.component';
import { CrearPreguntaModalComponent } from '../../shared/modales/preguntas/crear-pregunta/crear-pregunta.modal';
import { EditarPreguntaModalComponent } from '../../shared/modales/preguntas/editar-pregunta/editar-pregunta.modal';

type TabKey = 'preguntas' | 'respuestas';

type Vm = {
  loading: boolean;
  errorMessage: string;

  id_curso: number;
  id_evaluacion: number;

  perfil: any;
  curso: any;
  evaluacion: any;

  isDocente: boolean;

  labelMap: Record<string, string>;

  loadingTipos: boolean;
  tiposPregunta: TipoPreguntaMenu[];
  tiposSueltas: TipoPreguntaMenu[];
  tiposBloque: TipoPreguntaMenu[];

  loadingPreguntas: boolean;
  itemsTabla: any[];

  loadingRespuestas: boolean;
  intentosMejor: any[];
};

@Component({
  selector: 'app-evaluacion-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    BreadcrumbsComponent,

    PreguntasTableComponent,
    CrearPreguntaModalComponent,
    EditarPreguntaModalComponent,

    IntentosMejorTableComponent,
    RevisionIntentoModalComponent,
  ],
  templateUrl: './evaluacion.page.html',
  styleUrls: ['./evaluacion.page.css'],
})
export class EvaluacionPage {
  activeTab: TabKey = 'preguntas';

  createOpen = false;
  editOpen = false;
  selectedPregunta: any = null;

  revisionOpen = false;
  selectedIntentoId = 0;

  private reloadAll$ = new Subject<void>();
  private reloadRespuestas$ = new Subject<void>();
  private reloadTipos$ = new Subject<void>();

  vm$: Observable<Vm>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authApi: AuthService,
    private evalApi: EvaluacionesService,
    private preguntasApi: PreguntasService,
    private bloquesApi: BloquesService,
    private tipoApi: TipoPreguntaService,
    private cursosApi: CursosService,
    private rendApi: RendicionesService,
  ) {
    this.vm$ = this.buildVm();
  }

  private buildVm(): Observable<Vm> {
    const ids$ = this.route.paramMap.pipe(
      map((pm) => ({
        id_curso: Number(pm.get('id_curso') || 0),
        id_evaluacion: Number(pm.get('id_evaluacion') || 0),
      })),
      shareReplay(1),
    );

    // ✅ PERFIL:
    // - No navegar aquí.
    // - Si falla (401/403), el AuthErrorInterceptor + guards se encargan.
    const perfil$ = defer(() =>
      from(this.authApi.getPerfilCached?.() ?? this.authApi.getPerfil()),
    ).pipe(
      catchError(() => of(null)),
      shareReplay(1),
    );

    const isDocente$ = perfil$.pipe(
      map((perfil: any) => {
        const global = (perfil?.rol?.codigo || '').toString().trim().toUpperCase();
        return global === 'ADMIN' || global === 'DOCENTE';
      }),
      startWith(false),
      shareReplay(1),
    );

    // ✅ Curso y Evaluación: gate por perfil (evita requests “fantasma” al refrescar)
    const curso$ = combineLatest([ids$, perfil$]).pipe(
      switchMap(([{ id_curso }, perfil]) => {
        if (!id_curso) return of(null);
        if (!perfil) return of(null);
        return defer(() => from(this.cursosApi.detalleMiCurso(id_curso))).pipe(
          catchError(() => of(null)),
        );
      }),
      shareReplay(1),
    );

    const evaluacion$ = combineLatest([ids$, perfil$]).pipe(
      switchMap(([{ id_evaluacion }, perfil]) => {
        if (!id_evaluacion) return of(null);
        if (!perfil) return of(null);
        return defer(() => from(this.evalApi.obtenerPorId(id_evaluacion))).pipe(
          catchError(() => of(null)),
        );
      }),
      shareReplay(1),
    );

    const tiposState$ = combineLatest([
      perfil$,
      isDocente$,
      this.reloadTipos$.pipe(startWith(void 0)),
    ]).pipe(
      switchMap(([perfil, isDocente]) => {
        if (!perfil) {
          return of({
            loadingTipos: true,
            tiposPregunta: [],
            tiposSueltas: [],
            tiposBloque: [],
            error: '',
            isDocente,
          });
        }

        return defer(() => from(this.tipoApi.selectOneMenu())).pipe(
          map((tipos: any) => {
            const tiposPregunta: TipoPreguntaMenu[] = Array.isArray(tipos) ? tipos : [];
            return {
              loadingTipos: false,
              tiposPregunta,
              tiposSueltas: tiposPregunta.filter((t) => !t.es_bloque),
              tiposBloque: tiposPregunta.filter((t) => !!t.es_bloque),
              error: '',
              isDocente,
            };
          }),
          startWith({
            loadingTipos: true,
            tiposPregunta: [],
            tiposSueltas: [],
            tiposBloque: [],
            error: '',
            isDocente,
          }),
          catchError((e: any) =>
            of({
              loadingTipos: false,
              tiposPregunta: [],
              tiposSueltas: [],
              tiposBloque: [],
              error: isDocente
                ? (e?.error?.message ?? 'No se pudieron cargar tipos de pregunta.')
                : '',
              isDocente,
            }),
          ),
        );
      }),
      shareReplay(1),
    );

    const allState$ = combineLatest([ids$, perfil$, this.reloadAll$.pipe(startWith(void 0))]).pipe(
      switchMap(([{ id_evaluacion }, perfil]) => {
        if (!id_evaluacion) {
          return of({
            loadingPreguntas: false,
            itemsTabla: [],
            error: 'ID de evaluación inválido.',
          });
        }

        if (!perfil) {
          return of({
            loadingPreguntas: true,
            itemsTabla: [],
            error: '',
          });
        }

        return defer(() =>
          Promise.all([
            this.preguntasApi.listarPorEvaluacion(id_evaluacion),
            this.bloquesApi.listarPorEvaluacion(id_evaluacion),
          ]),
        ).pipe(
          map(([pregs, blqs]: any) => {
            const preguntas = Array.isArray(pregs) ? pregs : [];
            const bloques = Array.isArray(blqs) ? blqs : [];

            const itemsTabla = [
              ...preguntas.map((p: any) => ({
                kind: 'PREGUNTA',
                id: p?.id_pregunta ?? p?.id ?? 0,
                texto: p?.texto ?? '—',
                url_multimedia: p?.url_multimedia ?? null,
                tipo: p?.tipo,
                raw: p,
              })),
              ...bloques.map((b: any) => ({
                kind: 'BLOQUE',
                id: b?.id_bloque ?? b?.id ?? 0,
                texto: b?.enunciado ?? '—',
                url_audio: b?.url_audio ?? null,
                texto_base: b?.texto_base ?? null,
                tipo: b?.tipo,
                raw: b,
              })),
            ];

            return { loadingPreguntas: false, itemsTabla, error: '' };
          }),
          startWith({ loadingPreguntas: true, itemsTabla: [], error: '' }),
          catchError((e: any) =>
            of({
              loadingPreguntas: false,
              itemsTabla: [],
              error: e?.error?.message ?? 'No se pudieron cargar preguntas/bloques.',
            }),
          ),
        );
      }),
      shareReplay(1),
    );

    const respuestasState$ = combineLatest([
      ids$,
      perfil$,
      isDocente$,
      this.reloadRespuestas$.pipe(startWith(void 0)),
    ]).pipe(
      switchMap(([{ id_evaluacion }, perfil, isDocente]) => {
        if (!perfil) return of({ loadingRespuestas: true, intentosMejor: [], error: '' });
        if (!isDocente || !id_evaluacion)
          return of({ loadingRespuestas: false, intentosMejor: [], error: '' });

        return defer(() => from(this.rendApi.listarMejorIntentoPorEstudiante(id_evaluacion))).pipe(
          map((resp: any) => ({
            loadingRespuestas: false,
            intentosMejor: Array.isArray(resp?.intentos) ? resp.intentos : [],
            error: '',
          })),
          startWith({ loadingRespuestas: true, intentosMejor: [], error: '' }),
          catchError((e: any) =>
            of({
              loadingRespuestas: false,
              intentosMejor: [],
              error: e?.error?.message ?? 'No se pudieron cargar los intentos.',
            }),
          ),
        );
      }),
      shareReplay(1),
    );

    return combineLatest([
      ids$,
      perfil$,
      isDocente$,
      curso$,
      evaluacion$,
      tiposState$,
      allState$,
      respuestasState$,
    ]).pipe(
      map(([ids, perfil, isDocente, curso, evaluacion, tipos, all, resp]) => {
        const labelMap: Record<string, string> = {
          'mis-cursos': 'Mis cursos',
          [`curso:${ids.id_curso}`]: curso?.nombre ?? `Curso ${ids.id_curso}`,
          [`eval:${ids.id_evaluacion}`]: evaluacion?.titulo ?? `Evaluación ${ids.id_evaluacion}`,
        };

        const errorMessage =
          (ids.id_evaluacion ? '' : 'ID de evaluación inválido.') ||
          tipos.error ||
          all.error ||
          resp.error ||
          '';

        const loading =
          !ids.id_evaluacion ||
          !perfil ||
          !curso ||
          !evaluacion ||
          tipos.loadingTipos ||
          all.loadingPreguntas;

        return {
          loading,
          errorMessage,

          id_curso: ids.id_curso,
          id_evaluacion: ids.id_evaluacion,

          perfil,
          curso,
          evaluacion,

          isDocente,

          labelMap,

          loadingTipos: tipos.loadingTipos,
          tiposPregunta: tipos.tiposPregunta,
          tiposSueltas: tipos.tiposSueltas,
          tiposBloque: tipos.tiposBloque,

          loadingPreguntas: all.loadingPreguntas,
          itemsTabla: all.itemsTabla,

          loadingRespuestas: resp.loadingRespuestas,
          intentosMejor: resp.intentosMejor,
        } as Vm;
      }),
      startWith({
        loading: true,
        errorMessage: '',
        id_curso: 0,
        id_evaluacion: 0,
        perfil: null,
        curso: null,
        evaluacion: null,
        isDocente: false,
        labelMap: { 'mis-cursos': 'Mis cursos' },
        loadingTipos: false,
        tiposPregunta: [],
        tiposSueltas: [],
        tiposBloque: [],
        loadingPreguntas: false,
        itemsTabla: [],
        loadingRespuestas: false,
        intentosMejor: [],
      } as Vm),
      shareReplay(1),
    );
  }

  setTab(tab: TabKey) {
    this.activeTab = tab;
    if (tab === 'respuestas') this.reloadRespuestas$.next();
  }

  openCreate(vm: Vm) {
    if (!vm.tiposPregunta.length && !vm.loadingTipos) {
      this.reloadTipos$.next();
    }

    if (vm.tiposPregunta.length && vm.tiposSueltas.length === 0) {
      alert('Aún no hay tipos de pregunta suelta disponibles.');
      return;
    }

    this.createOpen = true;
    this.editOpen = false;
    this.selectedPregunta = null;
  }

  openEdit(p: any) {
    const item = p?.raw ?? p;
    const code = (item?.tipo?.codigo ?? '').toString().toUpperCase();
    const isBloque = code === 'LISTENING' || code === 'READING';

    this.selectedPregunta = isBloque
      ? { ...item, texto: item?.enunciado ?? item?.texto ?? '', __isBloque: true }
      : { ...item, __isBloque: false };

    this.editOpen = true;
    this.createOpen = false;
  }

  closeAll() {
    this.createOpen = false;
    this.editOpen = false;
    this.selectedPregunta = null;
  }

  async onCreated() {
    this.closeAll();
    this.reloadAll$.next();
  }

  async onUpdated() {
    this.closeAll();
    this.reloadAll$.next();
  }

  async onDelete(p: any) {
    const kind = (p?.kind ?? '').toString().toUpperCase();
    const code = (p?.tipo?.codigo ?? '').toString().toUpperCase();
    const esBloque = kind === 'BLOQUE' || code === 'LISTENING' || code === 'READING';

    const ok = confirm(esBloque ? '¿Eliminar este bloque?' : '¿Eliminar esta pregunta?');
    if (!ok) return;

    try {
      if (esBloque) {
        const id = p?.id ?? p?.id_bloque ?? p?.raw?.id_bloque;
        await this.bloquesApi.eliminar(Number(id));
      } else {
        const id = p?.id ?? p?.id_pregunta ?? p?.raw?.id_pregunta;
        await this.preguntasApi.eliminar(Number(id));
      }
      this.reloadAll$.next();
    } catch (e: any) {
      alert(e?.error?.message ?? 'No se pudo eliminar.');
    }
  }

  openRevision(it: any) {
    const id = Number(it?.id_intento ?? 0);
    if (!id) return;
    this.selectedIntentoId = id;
    this.revisionOpen = true;
  }

  closeRevision() {
    this.revisionOpen = false;
    this.selectedIntentoId = 0;
  }

  irARendir(idIntento: number, idCurso: number) {
    this.router.navigate(['/rendiciones/intentos', idIntento], {
      queryParams: { curso: idCurso },
    });
  }
}
