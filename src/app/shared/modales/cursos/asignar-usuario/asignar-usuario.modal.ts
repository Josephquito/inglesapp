import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, of, defer, from } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { CursosService } from '../../../../services/cursos.service';
import { UsuariosService } from '../../../../services/usuarios.service';

type Vm = {
  loading: boolean;
  error: string | null;
  usuariosDisponibles: any[];
};

@Component({
  selector: 'app-asignar-usuario-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './asignar-usuario.modal.html',
  styleUrls: ['../curso.modal.css'],
})
export class AsignarUsuarioModalComponent implements OnInit {
  @Input() perfil: any;
  @Input() curso: any;

  @Output() close = new EventEmitter<void>();
  @Output() assigned = new EventEmitter<void>();

  // UI local
  search = '';
  resultados: any[] = [];
  selected: any = null;

  // ✅ VM para estado/carga/usuarios
  vm$!: Observable<Vm>;

  constructor(
    private cursosApi: CursosService,
    private usuariosApi: UsuariosService,
  ) {}

  private get isAdminFlag() {
    return this.perfil?.rol?.codigo === 'ADMIN';
  }

  ngOnInit(): void {
    this.vm$ = this.buildVm();
  }

  private buildVm(): Observable<Vm> {
    return defer(() => {
      if (!this.isAdminFlag) {
        return of({
          loading: false,
          error: 'Solo un administrador puede asignar usuarios',
          usuariosDisponibles: [],
        } as Vm);
      }

      const idCurso = Number(this.curso?.id_curso);
      const idEntidadCurso = Number(this.curso?.entidad?.id_entidad);

      if (!idCurso)
        return of({ loading: false, error: 'Curso inválido', usuariosDisponibles: [] } as Vm);
      if (!idEntidadCurso)
        return of({
          loading: false,
          error: 'Entidad del curso inválida',
          usuariosDisponibles: [],
        } as Vm);

      return from(this.cursosApi.obtenerUsuariosCurso(idCurso)).pipe(
        switchMap((cursoUsers: any[]) => {
          const assignedIds = new Set<number>(
            (cursoUsers || [])
              .filter((u: any) => !!u.asignado)
              .map((u: any) => Number(u.id_usuario)),
          );

          return from(this.usuariosApi.listarTodos()).pipe(
            map((all: any[]) => {
              const usuariosDisponibles = (all || [])
                .filter((u: any) => Number(u.entidad?.id_entidad) === idEntidadCurso)
                .filter((u: any) => !assignedIds.has(Number(u.id_usuario)));

              return { loading: false, error: null, usuariosDisponibles } as Vm;
            }),
          );
        }),
        startWith({ loading: true, error: null, usuariosDisponibles: [] } as Vm),
        catchError((e: any) =>
          of({
            loading: false,
            error: e?.error?.message || e?.message || 'No se pudo cargar usuarios disponibles',
            usuariosDisponibles: [],
          } as Vm),
        ),
      );
    }).pipe(shareReplay(1));
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }

  onSearchChange(value: string, usuariosDisponibles: any[]) {
    this.search = value;

    const q = (value || '').trim().toLowerCase();
    if (!q) {
      this.resultados = [];
      return;
    }

    this.resultados = (usuariosDisponibles || [])
      .filter((u: any) => {
        const ced = String(u.identificacion || '').toLowerCase();
        const nom = String(u.nombres || '').toLowerCase();
        const ape = String(u.apellidos || '').toLowerCase();
        return ced.includes(q) || nom.includes(q) || ape.includes(q) || `${nom} ${ape}`.includes(q);
      })
      .slice(0, 12);
  }

  pick(u: any) {
    this.selected = u;
    this.search = `${u.identificacion} - ${u.nombres} ${u.apellidos}`;
    this.resultados = [];
  }

  async asignarSeleccionado(vm: Vm) {
    // vm.loading controla solo carga inicial; aquí usamos un flag local para el botón
    // para no mezclar estados:
    if (vm.loading) return;

    // ✅ flag local SOLO para el botón de asignar
    (this as any)._assigning = true;

    try {
      if (!this.selected) throw new Error('Seleccione un usuario');

      const idCurso = Number(this.curso?.id_curso);
      const idUsuario = Number(this.selected?.id_usuario);

      if (!idCurso) throw new Error('Curso inválido');
      if (!idUsuario) throw new Error('Usuario inválido');

      await this.cursosApi.asignarUsuarios(idCurso, [idUsuario]);
      this.assigned.emit();
    } catch (e: any) {
      // mostramos error local
      // (si quieres, puedes meterlo también al vm$, pero aquí lo dejamos simple)
      console.error(e);
      alert(e?.error?.message || e?.message || 'Error al asignar usuario');
    } finally {
      (this as any)._assigning = false;
    }
  }

  get assigning(): boolean {
    return !!(this as any)._assigning;
  }
}
