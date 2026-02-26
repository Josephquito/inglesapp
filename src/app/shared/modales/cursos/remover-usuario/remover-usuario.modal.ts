import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CursosService } from '../../../../services/cursos.service';

@Component({
  selector: 'app-remover-usuario-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './remover-usuario.modal.html',
  styleUrls: ['../curso.modal.css'],
})
export class RemoverUsuarioModalComponent {
  @Input() perfil: any;
  @Input() curso!: any;
  @Input() usuario!: any;

  @Output() close = new EventEmitter<void>();
  @Output() removed = new EventEmitter<void>();

  loading = false;
  error: string | null = null;

  constructor(private api: CursosService) {}

  isAdmin() {
    return this.perfil?.rol?.codigo === 'ADMIN';
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }

  async submit() {
    this.loading = true;
    this.error = null;

    try {
      if (!this.isAdmin()) throw new Error('Solo un administrador puede remover usuarios');

      await this.api.removerUsuarioDelCurso(
        Number(this.curso.id_curso),
        Number(this.usuario.id_usuario),
      );

      this.removed.emit();
    } catch (e: any) {
      this.error = e?.error?.message || e?.message || 'Error al remover usuario';
    } finally {
      this.loading = false;
    }
  }
}
