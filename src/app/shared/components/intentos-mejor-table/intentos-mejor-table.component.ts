import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-intentos-mejor-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './intentos-mejor-table.component.html',
  styleUrls: ['./intentos-mejor-table.component.css'],
})
export class IntentosMejorTableComponent {
  @Input() intentos: any[] = [];
  @Output() open = new EventEmitter<any>();

  onOpenClick(ev: MouseEvent, it: any) {
    ev.stopPropagation();
    this.open.emit(it);
  }

  nombre(it: any): string {
    const e = it?.estudiante;
    const full = `${e?.nombres ?? ''} ${e?.apellidos ?? ''}`.trim();
    return full || e?.email || '—';
  }

  estadoLabel(it: any): string {
    return it?.pendiente_revision ? 'Pendiente revisión' : 'Calificada';
  }

  badgeClass(it: any) {
    return it?.pendiente_revision ? 'badge-warning' : 'badge-success';
  }
}
