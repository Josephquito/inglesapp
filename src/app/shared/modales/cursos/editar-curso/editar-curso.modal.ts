import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CursosService } from '../../../../services/cursos.service';

@Component({
  selector: 'app-editar-curso-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './editar-curso.modal.html',
  styleUrls: ['../curso.modal.css'],
})
export class EditarCursoModalComponent implements OnInit {
  @Input() perfil: any;
  @Input() curso!: any;

  @Output() close = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  loading = false;
  error: string | null = null;

  form = {
    nombre: '',
    descripcion: '',
    fecha_inicio: '',
    fecha_fin: '',
    activo: true,
  };

  constructor(private api: CursosService) {}

  isAdmin() {
    return this.perfil?.rol?.codigo === 'ADMIN';
  }

  ngOnInit(): void {
    this.form.nombre = this.curso?.nombre || '';
    this.form.descripcion = this.curso?.descripcion || '';
    this.form.activo = !!this.curso?.activo;

    this.form.fecha_inicio = this.toDateInput(this.curso?.fecha_inicio);
    this.form.fecha_fin = this.toDateInput(this.curso?.fecha_fin);
  }

  toDateInput(v: any) {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }

  async submit() {
    this.loading = true;
    this.error = null;

    try {
      if (!this.isAdmin()) throw new Error('No autorizado');

      const payload = {
        nombre: this.form.nombre.trim(),
        descripcion: this.form.descripcion?.trim() || '',
        fecha_inicio: this.form.fecha_inicio ? new Date(this.form.fecha_inicio) : undefined,
        fecha_fin: this.form.fecha_fin ? new Date(this.form.fecha_fin) : undefined,
        activo: !!this.form.activo,
      };

      await this.api.actualizar(Number(this.curso.id_curso), payload);
      this.updated.emit();
    } catch (e: any) {
      this.error = e?.error?.message || e?.message || 'Error al actualizar curso';
    } finally {
      this.loading = false;
    }
  }
}
