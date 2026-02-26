import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EntidadService } from '../../../../services/entidad.service';

@Component({
  selector: 'app-create-entidad-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-entidad.modal.html',
  styleUrls: ['../entidad.modal.css'],
})
export class CreateEntidadModalComponent {
  @Input() open = false;
  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

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

  reset() {
    this.errorMessage = '';
    this.loading = false;
    this.form = {
      ruc: '',
      nombre_comercial: '',
      razon_social: '',
      direccion: '',
      imagen_logo: '',
      activo: true,
    };
  }

  onClose() {
    this.reset();
    this.close.emit();
  }

  async submit() {
    this.errorMessage = '';
    this.loading = true;

    try {
      await this.api.crear(this.form);
      this.created.emit();
      this.reset();
    } catch (e: any) {
      this.errorMessage = e?.error?.message ?? 'No se pudo crear la entidad.';
    } finally {
      this.loading = false;
    }
  }
}
