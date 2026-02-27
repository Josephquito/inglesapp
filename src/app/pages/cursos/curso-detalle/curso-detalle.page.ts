import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Observable, of, from, defer, Subject, combineLatest, timer } from 'rxjs';
import {
  catchError,
  map,
  switchMap,
  startWith,
  shareReplay,
  retryWhen,
  scan,
  delayWhen,
} from 'rxjs/operators';

import { CursosService } from '../../../services/cursos.service';
import { AuthService } from '../../../services/auth.service';

import { CursoUsuariosTableComponent } from '../../../shared/components/curso-usuarios-table/curso-usuarios-table.component';
import { AsignarUsuarioModalComponent } from '../../../shared/modales/cursos/asignar-usuario/asignar-usuario.modal';
import { RemoverUsuarioModalComponent } from '../../../shared/modales/cursos/remover-usuario/remover-usuario.modal';

type Vm = {
  loading: boolean;
  errorMessage: string;
  perfil: any;
  curso: any;
  usuariosAsignados: any[];
  isAdmin: boolean;
};

type LoadState<T> = {
  loading: boolean;
  data: T | null;
  error: string;
};

@Component({
  selector: 'app-curso-detalle',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    CursoUsuariosTableComponent,
    AsignarUsuarioModalComponent,
    RemoverUsuarioModalComponent,
  ],
  templateUrl: './curso-detalle.page.html',
  styleUrls: ['./curso-detalle.page.css'],
})
export class CursoDetallePage {
  asignarOpen = false;
  removerOpen = false;
  selectedUsuario: any = null;

  private refreshUsuarios$ = new Subject<void>();

  vm$: Observable<Vm>;

  constructor(
    private route: ActivatedRoute,
    private api: CursosService,
    private authApi: AuthService,
  ) {
    this.vm$ = this.buildVm();
  }

  // ✅ retry suave solo para errores transitorios (no para 401/403)
  private retryTransient<T>() {
    return (source: Observable<T>) =>
      source.pipe(
        retryWhen((errors) =>
          errors.pipe(
            scan((acc, err: any) => {
              const status = err?.status ?? err?.error?.status ?? 0;

              // ✅ NO reintentar auth errors (eso lo maneja interceptor/guards)
              if (status === 401 || status === 403) {
                throw err;
              }

              const isTransient =
                status === 0 || status === 502 || status === 503 || status === 504;

              // si no es transitorio, no reintentar
              if (!isTransient) {
                throw err;
              }

              // max 2 reintentos (total 3 intentos)
              if (acc >= 2) {
                throw err;
              }

              return acc + 1;
            }, 0),
            // backoff: 250ms, 600ms
            delayWhen((retryCount) => timer(retryCount === 1 ? 250 : 600)),
          ),
        ),
      );
  }

  private buildVm(): Observable<Vm> {
    const id$ = this.route.paramMap.pipe(
      map((pm) => Number(pm.get('id') || 0)),
      shareReplay(1),
    );

    // ✅ Perfil como state (sin convertir error a null “silenciosamente”)
    const perfilState$: Observable<LoadState<any>> = defer(() =>
      from((this.authApi as any).getPerfilCached?.() ?? this.authApi.getPerfil()),
    ).pipe(
      this.retryTransient(),
      map((perfil) => ({ loading: false, data: perfil, error: '' })),
      startWith({ loading: true, data: null, error: '' }),
      catchError((e: any) =>
        of({
          loading: false,
          data: null,
          error: e?.error?.message ?? e?.message ?? 'No se pudo cargar el perfil.',
        }),
      ),
      shareReplay(1),
    );

    // ✅ Curso como state + retry suave
    const cursoState$: Observable<LoadState<any>> = id$.pipe(
      switchMap((id) => {
        if (!id) {
          return of({ loading: false, data: null, error: 'ID inválido.' } as LoadState<any>);
        }

        return defer(() => from(this.api.obtenerPorId(id))).pipe(
          this.retryTransient(),
          map((curso) => ({ loading: false, data: curso, error: '' })),
          startWith({ loading: true, data: null, error: '' }),
          catchError((e: any) =>
            of({
              loading: false,
              data: null,
              error: e?.error?.message ?? 'No se pudo cargar el curso.',
            }),
          ),
        );
      }),
      shareReplay(1),
    );

    // ✅ Usuarios asignados: solo pedir cuando haya curso (id válido)
    //    y con retry suave para no “parpadear” la lista
    const usuariosAsignadosState$: Observable<LoadState<any[]>> = combineLatest([
      id$,
      this.refreshUsuarios$.pipe(startWith(void 0)),
    ]).pipe(
      switchMap(([id]) => {
        if (!id) return of({ loading: false, data: [], error: '' } as LoadState<any[]>);

        return defer(() => from(this.api.obtenerUsuariosCurso(id))).pipe(
          this.retryTransient(),
          map((data: any[]) => ({
            loading: false,
            data: (data || []).filter((u: any) => !!u.asignado),
            error: '',
          })),
          startWith({ loading: true, data: [], error: '' }),
          catchError(() =>
            of({
              loading: false,
              data: [],
              error: 'No se pudieron cargar los integrantes.',
            }),
          ),
        );
      }),
      shareReplay(1),
    );

    return combineLatest([perfilState$, cursoState$, usuariosAsignadosState$]).pipe(
      map(([perfilS, cursoS, usuariosS]) => {
        const perfil = perfilS.data;
        const curso = cursoS.data;

        const isAdmin = (perfil?.rol?.codigo || '').toString().toUpperCase() === 'ADMIN';

        // ✅ loading fino: mientras cualquiera esté cargando
        const loading = perfilS.loading || cursoS.loading || usuariosS.loading;

        // ✅ no mostrar error “flash” mientras loading=true
        const errorMessage =
          !loading && (cursoS.error || perfilS.error || usuariosS.error)
            ? cursoS.error || perfilS.error || usuariosS.error
            : '';

        return {
          loading,
          errorMessage,
          perfil,
          curso,
          usuariosAsignados: usuariosS.data ?? [],
          isAdmin,
        } as Vm;
      }),
      startWith({
        loading: true,
        errorMessage: '',
        perfil: null,
        curso: null,
        usuariosAsignados: [],
        isAdmin: false,
      } as Vm),
      shareReplay(1),
    );
  }

  private refreshUsuarios() {
    this.refreshUsuarios$.next();
  }

  openAsignar() {
    this.asignarOpen = true;
    this.removerOpen = false;
    this.selectedUsuario = null;
  }

  openRemover(u: any) {
    this.selectedUsuario = u;
    this.removerOpen = true;
    this.asignarOpen = false;
  }

  closeAll() {
    this.asignarOpen = false;
    this.removerOpen = false;
    this.selectedUsuario = null;
  }

  onAssigned() {
    this.closeAll();
    this.refreshUsuarios();
  }

  onRemoved() {
    this.closeAll();
    this.refreshUsuarios();
  }

  prettyDate(value: any) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  }
}
