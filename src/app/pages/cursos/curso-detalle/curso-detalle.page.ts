import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Observable, of, from, defer } from 'rxjs';
import { catchError, map, switchMap, startWith, shareReplay } from 'rxjs/operators';

import { CursosService } from '../../../services/cursos.service';
import { AuthService } from '../../../services/auth.service';

import { CursoUsuariosTableComponent } from '../../../shared/components/curso-usuarios-table/curso-usuarios-table.component';
import { AsignarUsuarioModalComponent } from '../../../shared/modales/cursos/asignar-usuario/asignar-usuario.modal';
import { RemoverUsuarioModalComponent } from '../../../shared/modales/cursos/remover-usuario/remover-usuario.modal';
import { Subject, combineLatest } from 'rxjs'; // 👈 agrega

type Vm = {
  loading: boolean;
  errorMessage: string;
  perfil: any;
  curso: any;
  usuariosAsignados: any[];
  isAdmin: boolean;
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

  private refreshUsuarios$ = new Subject<void>(); // ✅

  vm$: Observable<Vm>;

  constructor(
    private route: ActivatedRoute,
    private api: CursosService,
    private authApi: AuthService,
  ) {
    this.vm$ = this.buildVm();
  }

  private buildVm(): Observable<Vm> {
    const id$ = this.route.paramMap.pipe(
      map((pm) => Number(pm.get('id'))),
      shareReplay(1),
    );

    const perfil$ = defer(() => from(this.authApi.getPerfil())).pipe(
      catchError(() => of(null)),
      shareReplay(1),
    );

    const curso$ = id$.pipe(
      switchMap((id) => (id ? defer(() => from(this.api.obtenerPorId(id))) : of(null))),
      catchError(() => of(null)),
      shareReplay(1),
    );

    // ✅ cada vez que llamas refreshUsuarios$.next(), vuelve a consultar usuarios
    const usuariosAsignados$ = combineLatest([
      id$,
      this.refreshUsuarios$.pipe(startWith(void 0)), // 👈 trigger
    ]).pipe(
      switchMap(([id]) => {
        if (!id) return of([]);
        return defer(() => from(this.api.obtenerUsuariosCurso(id))).pipe(
          map((data: any[]) => (data || []).filter((u: any) => !!u.asignado)),
          catchError(() => of([])),
        );
      }),
      shareReplay(1),
    );

    return combineLatest([perfil$, curso$, usuariosAsignados$]).pipe(
      map(([perfil, curso, usuariosAsignados]) => {
        const isAdmin = (perfil?.rol?.codigo || '').toString().toUpperCase() === 'ADMIN';

        return {
          loading: !perfil || !curso, // si quieres loading más fino lo ajustamos
          errorMessage: !curso ? 'No se pudo cargar el curso.' : '',
          perfil,
          curso,
          usuariosAsignados,
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
    this.refreshUsuarios$.next(); // ✅
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

  // ✅ estos 2 se usan desde el template cuando el modal termina
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
