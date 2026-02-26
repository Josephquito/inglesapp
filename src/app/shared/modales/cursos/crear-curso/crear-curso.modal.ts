import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, of, defer } from 'rxjs';
import { catchError, shareReplay, startWith, map } from 'rxjs/operators';

import { CursosService } from '../../../../services/cursos.service';
import { EntidadService } from '../../../../services/entidad.service';

type EntidadOption = { value: number; label: string };

@Component({
  selector: 'app-crear-curso-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crear-curso.modal.html',
  styleUrls: ['../curso.modal.css'],
})
export class CrearCursoModalComponent implements OnInit {
  @Input() perfil: any;

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  loading = false;
  error: string | null = null;

  isAdminFlag = false;

  // ✅ Estado para el template vía async pipe
  entidadesState$!: Observable<{ loading: boolean; items: EntidadOption[] }>;

  form = {
    nombre: '',
    descripcion: '',
    id_entidad: 0,
    fecha_inicio: '',
    fecha_fin: '',
  };

  constructor(
    private cursosApi: CursosService,
    private entidadApi: EntidadService,
  ) {}

  ngOnInit(): void {
    this.isAdminFlag = this.perfil?.rol?.codigo === 'ADMIN';

    if (!this.isAdminFlag) {
      this.form.id_entidad = Number(this.perfil?.entidad?.id_entidad || 0);
      // no admin: no hace falta cargar lista
      this.entidadesState$ = of({ loading: false, items: [] });
      return;
    }

    // ✅ defer: se ejecuta cuando el template lo “suscribe”
    this.entidadesState$ = defer(() => this.entidadApi.selectOneMenu()).pipe(
      map((list: any) => ({
        loading: false,
        items: Array.isArray(list) ? (list as EntidadOption[]) : [],
      })),
      startWith({ loading: true, items: [] }),
      catchError(() => of({ loading: false, items: [] })),
      // evita múltiples llamadas si el template re-evalúa
      shareReplay(1),
    );
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }

  private dateFromInput(v: string): Date | undefined {
    if (!v) return undefined;
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  async submit() {
    this.loading = true;
    this.error = null;

    try {
      if (!this.isAdminFlag) throw new Error('Solo un administrador puede crear cursos');

      const nombre = (this.form.nombre || '').trim();
      if (!nombre) throw new Error('Nombre es obligatorio');

      const idEntidad = Number(this.form.id_entidad);
      if (!idEntidad) throw new Error('Debe elegir una entidad');

      const payload = {
        nombre,
        descripcion: (this.form.descripcion || '').trim(),
        id_entidad: idEntidad,
        fecha_inicio: this.dateFromInput(this.form.fecha_inicio),
        fecha_fin: this.dateFromInput(this.form.fecha_fin),
        activo: true,
      };

      await this.cursosApi.crear(payload);
      this.created.emit();
    } catch (e: any) {
      this.error = e?.error?.message || e?.message || 'Error al crear curso';
    } finally {
      this.loading = false;
    }
  }
}
