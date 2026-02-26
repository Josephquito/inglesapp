import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-confirmar-finalizar-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmar-finalizar.modal.html',
  styleUrls: ['./confirmar-finalizar.modal.css'],
})
export class ConfirmarFinalizarModalComponent {
  @Input() loading = false;
  @Input() error = '';

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  onBackdrop(e: MouseEvent) {
    if (this.loading) return;
    if (e.target === e.currentTarget) this.close.emit();
  }
}
