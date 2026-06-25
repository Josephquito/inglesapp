import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { UploadsService } from '../../../services/uploads.service';

type FillBlankSegment = { type: 'text'; value: string } | { type: 'blank'; numero: string };

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
  @Input() id_intento!: number;
  @Output() save = new EventEmitter<any>();

  respuestaTexto = '';
  opcionSeleccionada: number | null = null;
  matching: Array<{ izquierda: string; derecha: string }> = [];

  // ✅ NUEVO: segmentos del párrafo para FILL_BLANK (texto / espacio)
  fillBlankSegments: FillBlankSegment[] = [];

  mediaMode: 'image' | 'video' | 'link' = 'image';

  private lastPreguntaId: number | null = null;

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  recording = false;
  uploading = false;
  recError = '';

  recSeconds = 0;
  recTimeText = '00:00';
  private recInterval: any = null;

  previewBlob: Blob | null = null;
  previewUrl: string | null = null;
  finalUrl: string | null = null;

  constructor(
    private cd: ChangeDetectorRef,
    private uploads: UploadsService,
  ) {}

  ngOnChanges() {
    const id = Number(this.pregunta?.id_pregunta ?? 0) || null;

    if (id && this.lastPreguntaId !== id) {
      this.lastPreguntaId = id;

      this.mediaMode = 'image';

      this.respuestaTexto = this.pregunta?.respuesta_texto ?? '';
      this.opcionSeleccionada = this.pregunta?.id_opcion ?? null;
      this.matching = Array.isArray(this.pregunta?.respuesta_matching)
        ? [...this.pregunta.respuesta_matching]
        : [];

      // ✅ NUEVO: construir los segmentos del párrafo si es FILL_BLANK
      if (this.tipoCodigo() === 'FILL_BLANK') {
        this.buildFillBlankSegments(this.pregunta?.texto_base);
      } else {
        this.fillBlankSegments = [];
      }

      this.stopTimerUI();
      this.stopRecordingHard();
      this.uploading = false;
      this.recError = '';

      this.finalUrl = this.pregunta?.url_audio ?? null;

      this.clearPreviewOnly();

      this.cd.detectChanges();
      return;
    }

    if (!id && this.pregunta?.url_multimedia) {
      this.mediaMode = 'image';
      this.cd.detectChanges();
    }
  }

  tipoCodigo(): string {
    return (this.pregunta?.tipo?.codigo ?? '').toString().toUpperCase();
  }

  onImgError() {
    this.mediaMode = 'video';
    this.cd.detectChanges();
  }

  onVideoError() {
    this.mediaMode = 'link';
    this.cd.detectChanges();
  }

  onTextoChange() {
    this.save.emit({ respuesta_texto: this.respuestaTexto });
  }

  // ===== MULTIPLE_CHOICE / TRUE_FALSE / CHOOSE_IMAGE (mismo mecanismo) =====
  onOpcionChange(id: number) {
    this.opcionSeleccionada = id;
    this.save.emit({ id_opcion: id });
  }

  // ===== MATCHING / FILL_BLANK (mismo mecanismo: pares izquierda→derecha) =====
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

  // ✅ NUEVO: para que el <select> muestre la respuesta ya guardada
  // (antes siempre volvía a "Selecciona...", aunque el dato sí estaba ahí)
  valorMatching(clave: string): string {
    return this.matching.find((p) => p.izquierda === clave)?.derecha ?? '';
  }

  // ✅ NUEVO: parte el párrafo de FILL_BLANK en segmentos de texto / espacio,
  // para poder intercalar <select> donde corresponde cada {{blank_N}}
  private buildFillBlankSegments(textoBase: string) {
    const texto = String(textoBase ?? '');
    const partes = texto.split(/(\{\{blank_[^}]+\}\})/g);

    this.fillBlankSegments = partes
      .filter((p) => p.length > 0)
      .map((p) => {
        const m = p.match(/^\{\{blank_([^}]+)\}\}$/);
        if (m) return { type: 'blank' as const, numero: m[1] };
        return { type: 'text' as const, value: p };
      });
  }

  // ===== SPEAKING (sin cambios) =====
  async startRecording() {
    this.recError = '';

    if (!navigator?.mediaDevices?.getUserMedia) {
      this.recError = 'Tu navegador no soporta grabación de audio.';
      this.cd.detectChanges();
      return;
    }

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

      this.clearPreviewOnly();
      this.previewBlob = blob;
      this.previewUrl = URL.createObjectURL(blob);
      this.cd.detectChanges();

      await this.autoUpload(blob);
    } catch {
      this.recError = 'No se pudo preparar el audio.';
      this.cd.detectChanges();
    }
  }

  discardRecording() {
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

      const playUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;

      this.finalUrl = playUrl;

      this.save.emit({ url_audio: cleanUrl });

      this.clearPreviewOnly();
    } catch (e: any) {
      this.recError = e?.error?.message ?? e?.message ?? 'Error guardando el audio.';
    } finally {
      this.uploading = false;
      this.cd.detectChanges();
    }
  }

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

  ngOnDestroy() {
    this.stopTimerUI();
    this.stopRecordingHard();
    this.clearPreviewOnly();
  }

  retry() {
    this.recError = '';
    this.clearPreviewOnly();
    this.finalUrl = null;
    this.save.emit({ url_audio: '' });
    this.cd.detectChanges();
    void this.startRecording();
  }
}
