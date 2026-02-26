import { Component, ChangeDetectorRef, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EvaluacionesService } from '../../../../services/evaluaciones.service';

@Component({
  selector: 'app-crear-evaluacion-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crear-evaluacion.modal.html',
  styleUrls: ['../evaluacion.modal.css'],
})
export class CrearEvaluacionModalComponent {
  @Input() id_curso!: number;

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  loading = false;
  errorMessage = '';

  form = {
    titulo: '',
    descripcion: '',

    // ✅ nuevo: UI
    permitir_mas_intentos: false,
    intentos: 2, // se usa solo si permitir_mas_intentos = true

    tiene_tiempo: false,
    minutos: 0,

    valida_fraude: false,
    usa_camara: false,
  };

  constructor(
    private api: EvaluacionesService,
    private cd: ChangeDetectorRef,
  ) {}

  onBackdrop(ev: MouseEvent) {
    // click fuera cierra
    if (ev.target === ev.currentTarget) this.close.emit();
  }

  async submit() {
    this.errorMessage = '';

    if (!this.form.titulo.trim()) {
      this.errorMessage = 'El título es obligatorio.';
      this.cd.detectChanges();
      return;
    }

    this.loading = true;
    this.cd.detectChanges();

    try {
      const intentosFinal = this.form.permitir_mas_intentos
        ? Math.max(2, Number(this.form.intentos || 2))
        : 1;

      await this.api.crearEnCurso(this.id_curso, {
        titulo: this.form.titulo.trim(),
        descripcion: (this.form.descripcion || '').trim(),

        // ✅ SIEMPRE calificada
        es_calificada: true,

        // ✅ intentos: si no permite más, queda en 1
        tiene_intentos: intentosFinal > 1, // por si tu backend usa ese flag
        intentos: intentosFinal,

        tiene_tiempo: !!this.form.tiene_tiempo,
        minutos: this.form.tiene_tiempo ? Number(this.form.minutos || 0) : 0,

        valida_fraude: !!this.form.valida_fraude,
        usa_camara: !!this.form.usa_camara,
      });

      this.created.emit();
      this.close.emit();
    } catch (e: any) {
      this.errorMessage = e?.error?.message ?? 'No se pudo crear la evaluación.';
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }
}
