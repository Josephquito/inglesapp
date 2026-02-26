import { CommonModule } from '@angular/common';
import {
  Component,
  ChangeDetectorRef,
  EventEmitter,
  Input,
  Output,
  SimpleChanges,
} from '@angular/core';
import { RendicionesService } from '../../../../services/rendiciones.service';

type MediaMode = 'image' | 'video' | 'link';

@Component({
  selector: 'app-revision-intento-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './revision-intento.modal.html',
  styleUrls: ['./revision-intento.modal.css'],
})
export class RevisionIntentoModalComponent {
  @Input() idIntento!: number;

  @Output() close = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  loading = false;
  savingFinal = false;
  error = '';

  data: any = null;

  // estados por pregunta
  saving: Record<number, boolean> = {};
  miniError: Record<number, string> = {};

  // multimedia fallback por pregunta (image -> video -> link)
  mediaByQid: Record<number, MediaMode> = {};

  constructor(
    private api: RendicionesService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    void this.load();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['idIntento'] && !changes['idIntento'].firstChange) {
      void this.load();
    }
  }

  // ===== helpers =====
  tipo(p: any): string {
    return (p?.tipo?.codigo ?? '').toString().toUpperCase();
  }

  estudianteNombre(): string {
    const e = this.data?.estudiante;
    const full = `${e?.nombres ?? ''} ${e?.apellidos ?? ''}`.trim();
    return full || e?.email || 'Estudiante';
  }

  private qid(p: any): number {
    return Number(p?.id_pregunta ?? 0);
  }

  private flattenPreguntas(): any[] {
    const sueltas = Array.isArray(this.data?.preguntas_sueltas) ? this.data.preguntas_sueltas : [];
    const deBloques = Array.isArray(this.data?.bloques)
      ? this.data.bloques.flatMap((b: any) => (Array.isArray(b?.preguntas) ? b.preguntas : []))
      : [];
    return [...sueltas, ...deBloques];
  }

  // ===== MEDIA =====
  mediaMode(p: any): MediaMode {
    const id = this.qid(p);
    return this.mediaByQid[id] ?? 'image';
  }

  onImgError(p: any) {
    const id = this.qid(p);
    if (!id) return;
    this.mediaByQid[id] = 'video';
    this.cd.detectChanges();
  }

  onVideoError(p: any) {
    const id = this.qid(p);
    if (!id) return;
    this.mediaByQid[id] = 'link';
    this.cd.detectChanges();
  }

  private initUiFromData() {
    this.mediaByQid = {};
    this.saving = {};
    this.miniError = {};

    for (const p of this.flattenPreguntas()) {
      const id = Number(p?.id_pregunta ?? 0);
      if (!id) continue;
      this.mediaByQid[id] = 'image';
      this.saving[id] = false;
      this.miniError[id] = '';
    }
  }

  async load() {
    if (!this.idIntento) return;

    this.loading = true;
    this.error = '';
    this.cd.detectChanges();

    try {
      this.data = await this.api.obtenerIntentoParaRevision(this.idIntento);
      this.initUiFromData();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar el intento.';
      this.data = null;
      this.mediaByQid = {};
      this.saving = {};
      this.miniError = {};
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  // ===== MULTIPLE_CHOICE: mostrar texto =====
  opcionSeleccionadaTexto(p: any): string {
    const selectedId = Number(p?.respuesta?.opcion_seleccionada?.id_opcion ?? 0);
    if (!selectedId) return '—';

    const opts = Array.isArray(p?.opcionesRespuesta) ? p.opcionesRespuesta : [];
    const found = opts.find((o: any) => Number(o?.id_opcion) === selectedId);

    return (found?.texto ?? '').toString().trim() || `Opción #${selectedId}`;
  }

  // ===== Acciones: Correcto / Incorrecto (auto-save) =====
  async marcar(p: any, esCorrecta: boolean) {
    const id_pregunta = Number(p?.id_pregunta ?? 0);
    if (!id_pregunta) return;

    this.miniError[id_pregunta] = '';

    // si no hay respuesta, no calificas y avisas (para no “silenciar”)
    if (!p?.respuesta) {
      this.miniError[id_pregunta] = 'Sin respuesta del estudiante.';
      this.cd.detectChanges();
      return;
    }

    this.saving[id_pregunta] = true;
    this.cd.detectChanges();

    try {
      const payload = {
        es_correcta: !!esCorrecta,
        revisada: true,
      };

      await this.api.calificarPreguntaIntento(this.idIntento, id_pregunta, payload);

      // update optimista en UI
      p.respuesta.es_correcta = !!esCorrecta;
      p.respuesta.revisada = true;
      p.respuesta.auto_calificada = false;

      // reflejar estado general arriba al toque
      if (this.data?.intento) this.data.intento.pendiente_revision = false;

      this.changed.emit();
    } catch (e: any) {
      this.miniError[id_pregunta] = e?.error?.message ?? 'No se pudo guardar.';
    } finally {
      this.saving[id_pregunta] = false;
      this.cd.detectChanges();
    }
  }

  // ===== Recalcular nota final =====

  async onCalificarIntento() {
    this.savingFinal = true;
    this.error = '';
    this.cd.detectChanges();

    try {
      await this.api.calificarIntentoFinal(this.idIntento);

      // Avisar al padre (para que refresque tabla, etc.)
      this.changed.emit();

      // 🔥 Cerrar modal automáticamente
      this.close.emit();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo recalcular la nota.';
    } finally {
      this.savingFinal = false;
      this.cd.detectChanges();
    }
  }
}
