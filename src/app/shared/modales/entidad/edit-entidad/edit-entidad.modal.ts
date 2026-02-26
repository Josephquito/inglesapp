import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EntidadService } from '../../../../services/entidad.service';

@Component({
  selector: 'app-edit-entidad-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-entidad.modal.html',
  styleUrls: ['../entidad.modal.css'],
})
export class EditEntidadModalComponent {
  @Input() open = false;
  @Input() entidad: any = null;

  @Output() close = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  loading = false;
  errorMessage = '';

  form: any = {
    ruc: '',
    nombre_comercial: '',
    razon_social: '',
    direccion: '',
    imagen_logo: '',
    activo: true,
  };

  constructor(private api: EntidadService) {}

  ngOnChanges() {
    if (this.open && this.entidad) {
      this.errorMessage = '';
      this.loading = false;
      this.form = {
        ruc: this.entidad.ruc ?? '',
        nombre_comercial: this.entidad.nombre_comercial ?? '',
        razon_social: this.entidad.razon_social ?? '',
        direccion: this.entidad.direccion ?? '',
        imagen_logo: this.entidad.imagen_logo ?? '',
        activo: this.entidad.activo ?? true,
      };
    }
  }

  onClose() {
    this.errorMessage = '';
    this.loading = false;
    this.close.emit();
  }

  async submit() {
    if (!this.entidad?.id_entidad) return;

    this.errorMessage = '';
    this.loading = true;

    try {
      await this.api.editar(this.entidad.id_entidad, this.form);
      this.updated.emit();
    } catch (e: any) {
      this.errorMessage = e?.error?.message ?? 'No se pudo editar la entidad.';
    } finally {
      this.loading = false;
    }
  }
}
