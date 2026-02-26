import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-proctoring-warn-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './proctoring-warn.modal.html',
  styleUrls: ['./proctoring-warn.modal.css'],
})
export class ProctoringWarnModalComponent {
  @Input() warnings = 0;
  @Output() entendido = new EventEmitter<void>();

  onBackdrop(e: MouseEvent) {
    // Evita que cierren el modal haciendo clic afuera para obligar a leer
    if (e.target === e.currentTarget) {
      // Opcional: podrías sacudir el modal o mostrar un mensaje
    }
  }
}
