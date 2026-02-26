import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Observable, of } from 'rxjs';

@Component({
  selector: 'app-confirmar-rendir-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmar-rendir.modal.html',
  styleUrls: ['./confirmar-rendir.modal.css'],
})
export class ConfirmarRendirModalComponent {
  // ✅ ahora recibimos un stream (estable para Angular)
  @Input() info$: Observable<any | null> = of(null);

  @Input() loading = false;
  @Input() error = '';

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  intentosText(info: any): string {
    if (!info) return '';
    const tiene = !!info.tiene_intentos;
    const max = info.intentos ?? 1;
    const usados = info.intentos_usados ?? 0;
    const rest = info.intentos_restantes ?? 0;
    return tiene
      ? `Intentos: ${usados}/${max} (restantes: ${rest})`
      : `Intentos: 1 (restantes: ${rest})`;
  }

  tiempoText(info: any): string {
    if (!info) return '';
    return info.tiene_tiempo ? `${info.minutos} min` : 'Sin tiempo';
  }

  onBackdrop(e: MouseEvent) {
    if (this.loading) return;
    if (e.target === e.currentTarget) this.close.emit();
  }
}
