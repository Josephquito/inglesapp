import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UploadMeta {
  intentoId?: number;
  preguntaId?: number;
}

@Injectable({ providedIn: 'root' })
export class UploadsService {
  private API = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  upload(file: File, meta?: UploadMeta): Observable<{ url: string }> {
    const fd = new FormData();
    fd.append('file', file);

    // ✅ Solo agrega si existen
    if (meta?.intentoId) {
      fd.append('intentoId', String(meta.intentoId));
    }

    if (meta?.preguntaId) {
      fd.append('preguntaId', String(meta.preguntaId));
    }

    return this.http.post<{ url: string }>(`${this.API}/uploads`, fd);
  }
}
