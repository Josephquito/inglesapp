import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Observable, of, defer, from, Subject, combineLatest, BehaviorSubject } from 'rxjs';
import {
  catchError,
  map,
  shareReplay,
  startWith,
  switchMap,
  withLatestFrom,
  tap,
} from 'rxjs/operators';

// Servicios
import { CursosService } from '../../services/cursos.service';
import { EvaluacionesService } from '../../services/evaluaciones.service';
import { AuthService } from '../../services/auth.service';
import { RendicionesService } from '../../services/rendiciones.service';
import {
  CalificacionesService,
  MisCalificacionesCursoResponse,
  CalificacionesCursoDocenteResponse,
} from '../../services/calificaciones.service';

// Componentes
import { CursoUsuariosTableComponent } from '../../shared/components/curso-usuarios-table/curso-usuarios-table.component';
import { CrearEvaluacionModalComponent } from '../../shared/modales/evaluaciones/crear-evaluacion/crear-evaluacion.modal';
import { EditarEvaluacionModalComponent } from '../../shared/modales/evaluaciones/editar-evaluacion/editar-evaluacion.modal';
import { EvaluacionesTableComponent } from '../../shared/components/evaluaciones-table/evaluaciones-table.component';
import { ConfirmarRendirModalComponent } from '../../shared/modales/rendir-evaluacion/confirmar-rendir.modal';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { CalificacionesCursoTableComponent } from '../../shared/components/calificaciones-curso-table/calificaciones-curso-table.component';
import { RevisionIntentoModalComponent } from '../../shared/modales/rendiciones/revision-intento/revision-intento.modal';

type TabKey = 'actividades' | 'calificaciones' | 'integrantes';

type RendModalState = {
  rendirOpen: boolean;
  selectedEvalId: number;
};

type RendInfoState = {
  rendirLoading: boolean;
  rendirError: string;
  rendirInfo: any | null;
};

type UiState = {
  createEvalOpen: boolean;
  editEvalOpen: boolean;
  selectedEvalToEdit: any | null;

  revisionOpen: boolean;
  selectedIntentoId: number;

  activeTab: TabKey;

  rend: RendModalState;
};

type Vm = {
  loading: boolean;
  errorMessage: string;
  id_curso: number;
  curso: any;
  perfil: any;
  labelMap: Record<string, string>;

  loadingIntegrantes: boolean;
  integrantes: any[];

  loadingEvals: boolean;
  evaluaciones: any[];

  loadingCalif: boolean;
  calificacionesData: MisCalificacionesCursoResponse | CalificacionesCursoDocenteResponse | null;
  califError: string;

  canCreateEval: boolean;

  ui: UiState;
  rendInfo: RendInfoState;
};

@Component({
  selector: 'app-curso-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    BreadcrumbsComponent,
    CursoUsuariosTableComponent,
    CrearEvaluacionModalComponent,
    EditarEvaluacionModalComponent,
    EvaluacionesTableComponent,
    ConfirmarRendirModalComponent,
    CalificacionesCursoTableComponent,
    RevisionIntentoModalComponent,
  ],
  templateUrl: './curso.page.html',
  styleUrls: ['./curso.page.css'],
})
export class CursoPage {
  private reloadEvals$ = new Subject<void>();
  private reloadIntegrantes$ = new Subject<void>();
  private reloadCalif$ = new Subject<void>();

  private ui$ = new BehaviorSubject<UiState>({
    activeTab: 'actividades',
    createEvalOpen: false,
    editEvalOpen: false,
    selectedEvalToEdit: null,

    revisionOpen: false,
    selectedIntentoId: 0,

    rend: { rendirOpen: false, selectedEvalId: 0 },
  });

  private rendInfoLoad$ = new Subject<number>();
  private rendConfirm$ = new Subject<void>();

  // ✅ ESTE ES EL Observable REAL que va al modal
  public rendirInfo$!: Observable<any | null>;

  vm$: Observable<Vm>;

  constructor(
    private route: ActivatedRoute,
    private api: CursosService,
    private evalApi: EvaluacionesService,
    private authApi: AuthService,
    private router: Router,
    private rendApi: RendicionesService,
    private califApi: CalificacionesService,
  ) {
    this.vm$ = this.buildVm();
    this.bindConfirmFlow();
  }

  private buildVm(): Observable<Vm> {
    const id$ = this.route.paramMap.pipe(
      map((pm) => Number(pm.get('id') || 0)),
      shareReplay(1),
    );

    const perfil$ = defer(() => from(this.authApi.getPerfil())).pipe(
      catchError(() => of(null)),
      shareReplay(1),
    );

    const curso$ = id$.pipe(
      switchMap((id) => (id ? defer(() => from(this.api.detalleMiCurso(id))) : of(null))),
      catchError(() => of(null)),
      shareReplay(1),
    );

    const canCreateEval$ = combineLatest([perfil$, curso$]).pipe(
      map(([perfil, curso]) => {
        const global = (perfil?.rol?.codigo || '').toString().trim().toUpperCase();
        if (global === 'ADMIN' || global === 'DOCENTE') return true;
        const cursoRol = (curso?.miRol?.nombre || '').toString().trim().toUpperCase();
        return cursoRol === 'DOCENTE';
      }),
      startWith(false),
      shareReplay(1),
    );

    // ✅ Estado async del modal rendir
    const rendInfoState$: Observable<RendInfoState> = this.rendInfoLoad$.pipe(
      switchMap((id_evaluacion) =>
        defer(() => from(this.rendApi.infoRendir(id_evaluacion))).pipe(
          map((info) => ({ rendirLoading: false, rendirError: '', rendirInfo: info })),
          startWith({ rendirLoading: true, rendirError: '', rendirInfo: null } as RendInfoState),
          catchError((err: any) =>
            of({
              rendirLoading: false,
              rendirError: err?.error?.message ?? 'Error.',
              rendirInfo: null,
            } as RendInfoState),
          ),
        ),
      ),
      startWith({ rendirLoading: false, rendirError: '', rendirInfo: null } as RendInfoState),
      shareReplay(1),
    );

    // ✅ ESTE Observable se mantiene como Observable (NO en vm)
    this.rendirInfo$ = rendInfoState$.pipe(
      map((s) => s.rendirInfo),
      startWith(null),
      shareReplay(1),
    );

    // Calificaciones
    const califState$ = combineLatest([
      id$,
      perfil$,
      canCreateEval$,
      this.reloadCalif$.pipe(startWith(void 0)),
    ]).pipe(
      switchMap(([id, perfil, isDocente]) => {
        if (!id || !perfil) return of({ loading: false, data: null, error: '' });

        const request = isDocente
          ? this.califApi.calificacionesCursoDocente(id)
          : this.califApi.misCalificacionesCurso(id);

        return from(request).pipe(
          map((data) => ({ loading: false, data, error: '' })),
          startWith({ loading: true, data: null, error: '' }),
          catchError((e) => {
            const msg = e?.error?.message || 'Error de conexión con el servidor';
            return of({ loading: false, data: null, error: msg });
          }),
        );
      }),
      shareReplay(1),
    );

    // Integrantes
    const integrantesState$ = combineLatest([
      id$,
      this.reloadIntegrantes$.pipe(startWith(void 0)),
    ]).pipe(
      switchMap(([id]) => {
        if (!id) return of({ loadingIntegrantes: false, integrantes: [], error: 'ID inválido.' });
        return defer(() => from(this.api.obtenerUsuariosCurso(id))).pipe(
          map((lista: any[]) => ({
            loadingIntegrantes: false,
            integrantes: (lista || []).filter((u) => u.asignado),
            error: '',
          })),
          startWith({ loadingIntegrantes: true, integrantes: [], error: '' }),
          catchError(() =>
            of({ loadingIntegrantes: false, integrantes: [], error: 'Error integrantes.' }),
          ),
        );
      }),
      shareReplay(1),
    );

    // Evaluaciones
    const evalsState$ = combineLatest([
      id$,
      canCreateEval$,
      this.reloadEvals$.pipe(startWith(void 0)),
    ]).pipe(
      switchMap(([id, esDocente]) => {
        if (!id) return of({ loadingEvals: false, evaluaciones: [], error: 'ID inválido.' });

        const req = esDocente
          ? defer(() => from(this.evalApi.listarPorCursoDocente(id)))
          : defer(() => from(this.evalApi.listarActivasPorCurso(id)));

        return req.pipe(
          map((evs: any[]) => ({ loadingEvals: false, evaluaciones: evs || [], error: '' })),
          startWith({ loadingEvals: true, evaluaciones: [], error: '' }),
          catchError(() =>
            of({ loadingEvals: false, evaluaciones: [], error: 'Error evaluaciones.' }),
          ),
        );
      }),
      shareReplay(1),
    );

    return combineLatest([
      id$,
      perfil$,
      curso$,
      canCreateEval$,
      integrantesState$,
      evalsState$,
      califState$,
      this.ui$,
      rendInfoState$,
    ]).pipe(
      map(([id_curso, perfil, curso, canCreateEval, integ, evs, calif, ui, rendInfo]) => ({
        loading: !id_curso || !perfil || !curso || integ.loadingIntegrantes || evs.loadingEvals,
        errorMessage: integ.error || evs.error || calif.error || '',
        id_curso,
        curso,
        perfil,
        labelMap: {
          'mis-cursos': 'Mis cursos',
          [`curso:${id_curso}`]: curso?.nombre ?? `Curso ${id_curso}`,
        },
        loadingIntegrantes: integ.loadingIntegrantes,
        integrantes: integ.integrantes,
        loadingEvals: evs.loadingEvals,
        evaluaciones: evs.evaluaciones,
        loadingCalif: calif.loading,
        calificacionesData: calif.data,
        califError: calif.error,
        canCreateEval,
        ui,
        rendInfo,
      })),
      shareReplay(1),
    );
  }

  private bindConfirmFlow() {
    this.rendConfirm$
      .pipe(
        withLatestFrom(this.ui$),
        switchMap(([_, ui]) => {
          const idEval = Number(ui?.rend?.selectedEvalId || 0);
          if (!idEval) return of({ ok: false, error: 'Evaluación inválida.' });

          return defer(() => from(this.rendApi.iniciarIntento(idEval))).pipe(
            map((resp) => ({ ok: true, resp })),
            catchError((err: any) =>
              of({ ok: false, error: err?.error?.message ?? 'No se pudo iniciar.' }),
            ),
          );
        }),
        tap(async (result: any) => {
          if (!result?.ok) {
            // Dejamos el modal abierto; el error de iniciarIntento lo reflejamos como error del rendInfo:
            // (si quieres separar errores, lo hacemos en un confirmState$ aparte)
            // Por ahora: mantenemos modal abierto y listo.
            return;
          }

          const current = this.ui$.value;
          this.ui$.next({ ...current, rend: { rendirOpen: false, selectedEvalId: 0 } });

          const resp = result.resp;
          await this.router.navigate(['/rendiciones', 'intentos', resp.id_intento], {
            queryParams: { curso: this.route.snapshot.params['id'] },
          });
        }),
      )
      .subscribe();
  }

  setTab(tab: TabKey) {
    const current = this.ui$.value;
    this.ui$.next({ ...current, activeTab: tab });
    if (tab === 'calificaciones') this.reloadCalif$.next();
  }

  crearEvaluacion() {
    const current = this.ui$.value;
    this.ui$.next({ ...current, createEvalOpen: true });
  }
  closeCreateEvaluacion() {
    const current = this.ui$.value;
    this.ui$.next({ ...current, createEvalOpen: false });
  }
  onCreatedEvaluacion() {
    const current = this.ui$.value;
    this.ui$.next({ ...current, createEvalOpen: false });
    this.reloadEvals$.next();
  }

  onUpdatedEvaluacion() {
    const current = this.ui$.value;
    this.ui$.next({ ...current, editEvalOpen: false, selectedEvalToEdit: null });
    this.reloadEvals$.next();
  }
  openEditEvaluacion(e: any) {
    const current = this.ui$.value;
    this.ui$.next({ ...current, selectedEvalToEdit: e, editEvalOpen: true });
  }
  closeEditEvaluacion() {
    const current = this.ui$.value;
    this.ui$.next({ ...current, editEvalOpen: false, selectedEvalToEdit: null });
  }

  async onActivarEval(e: any) {
    await this.evalApi.activar(e.id_evaluacion);
    this.reloadEvals$.next();
  }
  async onInactivarEval(e: any) {
    await this.evalApi.inactivar(e.id_evaluacion);
    this.reloadEvals$.next();
  }
  async onEliminarEval(e: any) {
    if (confirm('¿Eliminar?')) {
      await this.evalApi.eliminar(e.id_evaluacion);
      this.reloadEvals$.next();
    }
  }

  openEvaluacion(e: any, canCreateEval: boolean, id_curso: number) {
    const idEval = Number(e?.id_evaluacion);
    if (!idEval) return;

    if (canCreateEval) {
      this.router.navigateByUrl(`/curso/${id_curso}/evaluacion/${idEval}`);
    } else {
      this.openRendirModal(idEval);
    }
  }

  openRendirModal(id_evaluacion: number) {
    const current = this.ui$.value;
    this.ui$.next({
      ...current,
      rend: { rendirOpen: true, selectedEvalId: Number(id_evaluacion) },
    });

    this.rendInfoLoad$.next(Number(id_evaluacion));
  }

  closeRendir() {
    const current = this.ui$.value;
    this.ui$.next({ ...current, rend: { rendirOpen: false, selectedEvalId: 0 } });
  }

  confirmRendir() {
    this.rendConfirm$.next();
  }

  onOpenIntento(id_intento: number) {
    if (!id_intento) return;
    const current = this.ui$.value;
    this.ui$.next({ ...current, revisionOpen: true, selectedIntentoId: id_intento });
  }

  closeRevision() {
    const current = this.ui$.value;
    this.ui$.next({ ...current, revisionOpen: false, selectedIntentoId: 0 });
  }

  onRevisionChanged() {
    this.reloadCalif$.next();
  }

  irARendir(idIntento: number, idCurso: number) {
    this.router.navigate(['/rendiciones/intentos', idIntento], {
      queryParams: { curso: idCurso },
    });
  }
}
