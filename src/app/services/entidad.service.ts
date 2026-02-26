import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class EntidadService {
  private API = `${environment.apiUrl}/entidad`;

  constructor(private http: HttpClient) {}

  listar() {
    return firstValueFrom(this.http.get<any[]>(`${this.API}/listar`).pipe(timeout(12000)));
  }

  crear(payload: any) {
    return firstValueFrom(this.http.post<any>(`${this.API}/crear`, payload).pipe(timeout(12000)));
  }

  editar(id: number, payload: any) {
    return firstValueFrom(
      this.http.put<any>(`${this.API}/editar/${id}`, payload).pipe(timeout(12000)),
    );
  }

  selectOneMenu() {
    return firstValueFrom(this.http.get<any[]>(`${this.API}/selectOneMenu`).pipe(timeout(12000)));
  }

  obtenerPorId(id: number) {
    return firstValueFrom(this.http.get<any>(`${this.API}/${id}`).pipe(timeout(12000)));
  }
}
