import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-evaluaciones-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './evaluaciones-table.component.html',
  styleUrls: ['./evaluaciones-table.component.css'],
})
export class EvaluacionesTableComponent {
  @Input() evaluaciones: any[] = [];

  // si true muestra acciones (activar/inactivar/eliminar)
  @Input() canManage = false;

  @Output() open = new EventEmitter<any>(); // ✅ NUEVO

  @Output() activar = new EventEmitter<any>();
  @Output() inactivar = new EventEmitter<any>();
  @Output() eliminar = new EventEmitter<any>();
  @Output() editar = new EventEmitter<any>();

  onOpen(e: any) {
    this.open.emit(e);
  }
}
