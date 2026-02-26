import {
  Component,
  ChangeDetectorRef,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EvaluacionesService } from '../../../../services/evaluaciones.service';

@Component({
  selector: 'app-editar-evaluacion-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './editar-evaluacion.modal.html',
  styleUrls: ['../evaluacion.modal.css'], // tu CSS global
})
export class EditarEvaluacionModalComponent implements OnChanges {
  @Input() evaluacion: any;

  @Output() close = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  loading = false;
  errorMessage = '';

  form: any = {
    titulo: '',
    descripcion: '',
    permitir_mas_intentos: false,
    intentos: 2,
    tiene_tiempo: false,
    minutos: 0,
    valida_fraude: false,
    usa_camara: false,
  };

  constructor(
    private api: EvaluacionesService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['evaluacion'] && this.evaluacion) {
      const intentosActual = Number(this.evaluacion.intentos ?? 1);

      this.form = {
        titulo: this.evaluacion.titulo || '',
        descripcion: this.evaluacion.descripcion || '',

        // ✅ UI: permitir más intentos si intentos > 1
        permitir_mas_intentos: intentosActual > 1,
        intentos: Math.max(2, intentosActual),

        tiene_tiempo: !!this.evaluacion.tiene_tiempo,
        minutos: Number(this.evaluacion.minutos ?? 0),

        valida_fraude: !!this.evaluacion.valida_fraude,
        usa_camara: !!this.evaluacion.usa_camara,
      };
    }
  }

  onBackdrop(ev: MouseEvent) {
    if (ev.target === ev.currentTarget) this.close.emit();
  }

  async submit() {
    this.errorMessage = '';

    if (!this.form.titulo?.trim()) {
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

      await this.api.actualizar(this.evaluacion.id_evaluacion, {
        titulo: this.form.titulo.trim(),
        descripcion: (this.form.descripcion || '').trim(),

        // ✅ siempre calificada
        es_calificada: true,

        // ✅ intentos
        tiene_intentos: intentosFinal > 1, // si tu backend lo usa
        intentos: intentosFinal,

        // ✅ tiempo
        tiene_tiempo: !!this.form.tiene_tiempo,
        minutos: this.form.tiene_tiempo ? Number(this.form.minutos || 0) : 0,

        // ✅ flags
        valida_fraude: !!this.form.valida_fraude,
        usa_camara: !!this.form.usa_camara,
      });

      this.updated.emit();
      this.close.emit();
    } catch (e: any) {
      this.errorMessage = e?.error?.message ?? 'No se pudo actualizar la evaluación.';
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }
}
