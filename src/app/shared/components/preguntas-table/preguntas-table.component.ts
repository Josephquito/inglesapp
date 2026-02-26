import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-preguntas-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './preguntas-table.component.html',
  styleUrls: ['./preguntas-table.component.css'],
})
export class PreguntasTableComponent {
  @Input() preguntas: any[] = [];
  @Input() canEdit = false;

  @Output() edit = new EventEmitter<any>();
  @Output() remove = new EventEmitter<any>();

  // ===== Click handlers =====

  canOpenEdit(p: any): boolean {
    return this.canEdit;
  }

  onRowClick(p: any) {
    if (!this.canEdit) return;
    this.edit.emit(p);
  }

  onDeleteClick(ev: MouseEvent, p: any) {
    ev.stopPropagation();
    this.remove.emit(p);
  }

  // ===== Helpers existentes =====

  displayText(p: any): string {
    return (p?.titulo ?? p?.texto ?? p?.enunciado ?? '—').toString();
  }

  tipoNombre(p: any): string {
    return (p?.tipoNombre ?? p?.tipo?.nombre ?? '—').toString();
  }

  tipoCodigo(p: any): string {
    return (p?.tipoCodigo ?? p?.tipo?.codigo ?? '').toString().toUpperCase();
  }

  modoLabel(p: any): string {
    const c = this.tipoCodigo(p);
    if (c === 'MULTIPLE_CHOICE' || c === 'MATCHING') return 'Cerrada';
    if (c === 'LISTENING' || c === 'READING') return 'Bloque';
    return 'Abierta';
  }

  badgeClass(p: any) {
    const c = this.tipoCodigo(p);
    if (c === 'MULTIPLE_CHOICE' || c === 'MATCHING') return 'badge-success';
    if (c === 'LISTENING' || c === 'READING') return 'badge-warning';
    return 'badge-warning';
  }

  extraInfo(p: any): string {
    const c = this.tipoCodigo(p);

    if (c === 'LISTENING' && (p?.url_audio || p?.raw?.url_audio)) {
      const u = p?.url_audio ?? p?.raw?.url_audio;
      return `Audio: ${u}`;
    }

    if (c === 'READING' && (p?.texto_base || p?.raw?.texto_base)) {
      const t = p?.texto_base ?? p?.raw?.texto_base;
      const preview = String(t).slice(0, 80);
      return `Texto base: ${preview}${String(t).length > 80 ? '…' : ''}`;
    }

    if (c === 'WRITING' && (p?.respuesta_esperada || p?.raw?.respuesta_esperada)) {
      const r = p?.respuesta_esperada ?? p?.raw?.respuesta_esperada;
      return `Resp. esperada: ${r}`;
    }

    if (c === 'MULTIPLE_CHOICE') {
      const ops = p?.opcionesRespuesta ?? p?.raw?.opcionesRespuesta;
      return `Opciones: ${Array.isArray(ops) ? ops.length : 0}`;
    }

    if (c === 'MATCHING') {
      const pares = p?.emparejamientos ?? p?.raw?.emparejamientos;
      return `Pares: ${Array.isArray(pares) ? pares.length : 0}`;
    }

    return '';
  }

  multimedia(p: any): string | null {
    return p?.url_multimedia ?? p?.raw?.url_multimedia ?? null;
  }
}
