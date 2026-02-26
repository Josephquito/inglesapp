import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import {
  CalificacionEstado,
  MisCalificacionesCursoResponse,
  CalificacionesCursoDocenteResponse,
} from '../../../services/calificaciones.service';

@Component({
  selector: 'app-calificaciones-curso-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calificaciones-curso-table.component.html',
  styleUrls: ['./calificaciones-curso-table.component.css'],
})
export class CalificacionesCursoTableComponent {
  @Input() mode: 'ESTUDIANTE' | 'DOCENTE' = 'ESTUDIANTE';

  // data (solo uno se usa según mode)
  @Input() studentData: MisCalificacionesCursoResponse | null = null;
  @Input() teacherData: CalificacionesCursoDocenteResponse | null = null;

  @Input() loading = false;
  @Input() error = '';

  // navegación (padre decide)
  @Output() openIntento = new EventEmitter<number>(); // ir a resultado/revisión según rol

  badgeClass(estado: CalificacionEstado) {
    if (estado === 'CALIFICADO') return 'badge badge-success';
    if (estado === 'PENDIENTE_REVISION') return 'badge badge-warning';
    return 'badge';
  }

  badgeText(estado: CalificacionEstado) {
    if (estado === 'CALIFICADO') return 'Calificado';
    if (estado === 'PENDIENTE_REVISION') return 'Pendiente';
    return 'Sin entregar';
  }

  fmt(n: any) {
    const v = Number(n ?? 0);
    return Number.isFinite(v) ? v.toFixed(2).replace(/\.00$/, '') : '0';
  }

  initials(nombres: string, apellidos: string) {
    const a = (nombres ?? '').trim().charAt(0).toUpperCase();
    const b = (apellidos ?? '').trim().charAt(0).toUpperCase();
    return `${a}${b}`.trim() || 'U';
  }

  // doc: obtener celda por eval id (para no depender del orden)
  cellFor(est: any, idEval: number) {
    const arr = est?.calificaciones ?? [];
    return arr.find((x: any) => Number(x?.id_evaluacion) === Number(idEval)) ?? null;
  }
}
