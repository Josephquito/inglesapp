import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { UploadsService } from '../../../services/uploads.service';

@Component({
  selector: 'app-rendir-pregunta',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rendir-pregunta.component.html',
  styleUrls: ['./rendir-pregunta.component.css'],
})
export class RendirPreguntaComponent {
  @Input() pregunta: any;
  @Input() estado: any;
  @Input() id_intento!: number; // ✅ pásalo desde el padre
  @Output() save = new EventEmitter<any>();

  // ===== modelos locales =====
  respuestaTexto = '';
  opcionSeleccionada: number | null = null;
  matching: Array<{ izquierda: string; derecha: string }> = [];

  // ===== MEDIA: image -> video -> link =====
  mediaMode: 'image' | 'video' | 'link' = 'image';

  // evita reset por autosave/re-render
  private lastPreguntaId: number | null = null;

  // ===== SPEAKING: recorder =====
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  recording = false;
  uploading = false;
  recError = '';

  recSeconds = 0;
  recTimeText = '00:00';
  private recInterval: any = null;

  // preview local
  previewBlob: Blob | null = null;
  previewUrl: string | null = null;

  // url definitiva (local) para que no dependa del debounce del padre
  finalUrl: string | null = null;

  constructor(
    private cd: ChangeDetectorRef,
    private uploads: UploadsService,
  ) {}

  ngOnChanges() {
    const id = Number(this.pregunta?.id_pregunta ?? 0) || null;

    // Solo reiniciar cuando cambia de pregunta
    if (id && this.lastPreguntaId !== id) {
      this.lastPreguntaId = id;

      // reset media
      this.mediaMode = 'image';

      // reset respuestas locales
      this.respuestaTexto = this.pregunta?.respuesta_texto ?? '';
      this.opcionSeleccionada = this.pregunta?.id_opcion ?? null;
      this.matching = Array.isArray(this.pregunta?.respuesta_matching)
        ? [...this.pregunta.respuesta_matching]
        : [];

      // speaking reset
      this.stopTimerUI();
      this.stopRecordingHard(); // por si estaba grabando
      this.uploading = false;
      this.recError = '';

      // cargar url definitiva que venga del back
      this.finalUrl = this.pregunta?.url_audio ?? null;

      // limpiar preview de la pregunta anterior
      this.clearPreviewOnly();

      this.cd.detectChanges();
      return;
    }

    // Si el id no viene, al menos intenta reiniciar media si hay url_multimedia
    if (!id && this.pregunta?.url_multimedia) {
      this.mediaMode = 'image';
      this.cd.detectChanges();
    }
  }

  // ===== UI helpers =====
  tipoCodigo(): string {
    return (this.pregunta?.tipo?.codigo ?? '').toString().toUpperCase();
  }

  // ===== MEDIA handlers =====
  onImgError() {
    this.mediaMode = 'video';
    this.cd.detectChanges();
  }

  onVideoError() {
    this.mediaMode = 'link';
    this.cd.detectChanges();
  }

  // ===== WRITING =====
  onTextoChange() {
    this.save.emit({ respuesta_texto: this.respuestaTexto });
  }

  // ===== MULTIPLE_CHOICE =====
  onOpcionChange(id: number) {
    this.opcionSeleccionada = id;
    this.save.emit({ id_opcion: id });
  }

  // ===== MATCHING =====
  setMatching(izquierda: string, derecha: string) {
    const idx = this.matching.findIndex((p) => p.izquierda === izquierda);
    if (idx >= 0) this.matching[idx] = { izquierda, derecha };
    else this.matching.push({ izquierda, derecha });

    this.save.emit({ respuesta_matching: this.matching });
  }

  onMatchingChange(izquierda: string, event: Event) {
    const target = event.target as HTMLSelectElement | null;
    const derecha = target?.value ?? '';
    this.setMatching(izquierda, derecha);
  }

  // ===== SPEAKING =====
  async startRecording() {
    this.recError = '';

    if (!navigator?.mediaDevices?.getUserMedia) {
      this.recError = 'Tu navegador no soporta grabación de audio.';
      this.cd.detectChanges();
      return;
    }

    // si había preview anterior, lo reemplazamos
    this.clearPreviewOnly();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = this.pickAudioMimeType();
      this.recorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream);

      this.chunks = [];

      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };

      // ✅ onstop async safe
      this.recorder.onstop = () => void this.onRecorderStop();

      this.recording = true;
      this.startTimerUI();
      this.recorder.start();
      this.cd.detectChanges();
    } catch (e: any) {
      this.cleanupStream();
      this.recError =
        e?.name === 'NotAllowedError'
          ? 'Permiso de micrófono denegado.'
          : 'No se pudo iniciar la grabación.';
      this.cd.detectChanges();
    }
  }

  stopRecording() {
    if (!this.recorder || !this.recording) return;

    try {
      this.recording = false;
      this.stopTimerUI();
      this.recorder.stop();
      this.cd.detectChanges();
    } catch {
      // ignore
    }
  }

  // si cambian de pregunta / destruyen / etc.
  private stopRecordingHard() {
    try {
      if (this.recorder && this.recording) {
        this.recording = false;
        this.stopTimerUI();
        this.recorder.stop();
      }
    } catch {
      // ignore
    } finally {
      this.cleanupStream();
      this.chunks = [];
    }
  }

  private async onRecorderStop() {
    try {
      const mime = this.recorder?.mimeType || 'audio/webm';
      const blob = new Blob(this.chunks, { type: mime });

      this.chunks = [];
      this.cleanupStream();

      // preview inmediato
      this.clearPreviewOnly();
      this.previewBlob = blob;
      this.previewUrl = URL.createObjectURL(blob);
      this.cd.detectChanges();

      // ✅ AUTO SUBIR al detener (sobrescribe en backend)
      await this.autoUpload(blob);
    } catch {
      this.recError = 'No se pudo preparar el audio.';
      this.cd.detectChanges();
    }
  }

  discardRecording() {
    // “Reintentar” solo borra preview (no borra el definitivo)
    this.clearPreviewOnly();
    this.recError = '';
    this.cd.detectChanges();
  }
  audioKey = 0;

  private async autoUpload(blob: Blob) {
    const intentoId = Number(this.id_intento ?? 0);
    const preguntaId = Number(this.pregunta?.id_pregunta ?? 0);

    if (!intentoId || !preguntaId) {
      this.recError = 'No se pudo guardar: faltan IDs (intento/pregunta).';
      this.cd.detectChanges();
      return;
    }

    try {
      this.uploading = true;
      this.recError = '';
      this.cd.detectChanges();

      const fileExt = this.getExtFromMime(blob.type);
      const file = new File([blob], `audio.${fileExt}`, { type: blob.type });

      const resp = await firstValueFrom(this.uploads.upload(file, { intentoId, preguntaId }));
      const cleanUrl = (resp?.url ?? '').toString().trim();

      if (!cleanUrl) throw new Error('No se recibió URL del audio');

      // ✅ Para reproducir SIEMPRE el último (rompe caché)
      const playUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;

      // ✅ reflejar inmediatamente en UI (usa playUrl)
      this.finalUrl = playUrl;

      // ✅ guarda en BD la url limpia (sin v=timestamp)
      this.save.emit({ url_audio: cleanUrl });

      // ✅ limpiar preview (pero queda el finalUrl)
      this.clearPreviewOnly();
    } catch (e: any) {
      this.recError = e?.error?.message ?? e?.message ?? 'Error guardando el audio.';
    } finally {
      this.uploading = false;
      this.cd.detectChanges();
    }
  }

  // ===== helpers mime =====
  private pickAudioMimeType(): string | null {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];
    for (const c of candidates) {
      if ((window as any).MediaRecorder?.isTypeSupported?.(c)) return c;
    }
    return null;
  }

  private getExtFromMime(mime: string): string {
    const m = (mime || '').toLowerCase();
    if (m.includes('ogg')) return 'ogg';
    if (m.includes('mp4')) return 'm4a';
    return 'webm';
  }

  private cleanupStream() {
    try {
      this.stream?.getTracks?.().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    this.stream = null;
    this.recorder = null;
  }

  private clearPreviewOnly() {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.previewBlob = null;
  }

  // ===== timer UI =====
  private startTimerUI() {
    this.stopTimerUI();
    this.recSeconds = 0;
    this.recTimeText = '00:00';

    this.recInterval = setInterval(() => {
      this.recSeconds++;
      const mm = String(Math.floor(this.recSeconds / 60)).padStart(2, '0');
      const ss = String(this.recSeconds % 60).padStart(2, '0');
      this.recTimeText = `${mm}:${ss}`;
      this.cd.detectChanges();
    }, 1000);
  }

  private stopTimerUI() {
    if (this.recInterval) clearInterval(this.recInterval);
    this.recInterval = null;
    this.recSeconds = 0;
    this.recTimeText = '00:00';
  }

  // (opcional) si alguna vez destruyes el componente mientras graba
  ngOnDestroy() {
    this.stopTimerUI();
    this.stopRecordingHard();
    this.clearPreviewOnly();
  }

  retry() {
    // 1) Limpia errores/preview
    this.recError = '';
    this.clearPreviewOnly();

    // 2) “Elimina lo grabado” (lo que quedó definitivo)
    this.finalUrl = null;

    // 3) Opcional PERO recomendado: borrar en backend la respuesta guardada
    // (como ahora sobrescribes el archivo, esto es para que el intento quede vacío)
    this.save.emit({ url_audio: '' });

    this.cd.detectChanges();

    // 4) Inicia una nueva grabación
    void this.startRecording();
  }
}
