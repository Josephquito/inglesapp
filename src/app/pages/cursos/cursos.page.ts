import { Component, ChangeDetectorRef, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

import { CursosService } from '../../services/cursos.service';
import { CrearCursoModalComponent } from '../../shared/modales/cursos/crear-curso/crear-curso.modal';
import { EditarCursoModalComponent } from '../../shared/modales/cursos/editar-curso/editar-curso.modal';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-cursos',
  standalone: true,
  imports: [CommonModule, RouterModule, CrearCursoModalComponent, EditarCursoModalComponent],
  templateUrl: './cursos.page.html',
  styleUrls: ['./cursos.page.css'],
})
export class CursosPage {
  loading = false;
  errorMessage = '';

  perfil: any = null;
  cursos: any[] = [];

  createOpen = false;
  editOpen = false;
  selected: any = null;

  constructor(
    private api: CursosService,
    private authApi: AuthService,
    private router: Router,
    private cd: ChangeDetectorRef,
  ) {
    // ✅ Corre después del primer render (evita NG0100)
    afterNextRender(() => {
      void this.init();
    });
  }

  private async sleep(ms: number) {
    await new Promise((r) => setTimeout(r, ms));
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 350): Promise<T> {
    let lastErr: any;
    for (let i = 0; i <= attempts; i++) {
      try {
        return await fn();
      } catch (e: any) {
        lastErr = e;
        const status = e?.status ?? e?.error?.status ?? 0;
        const isTransient = status === 0 || status === 502 || status === 503 || status === 504;
        if (!isTransient || i === attempts) break;
        await this.sleep(delayMs);
      }
    }
    throw lastErr;
  }

  async init() {
    this.loading = true;
    this.errorMessage = '';
    this.cd.detectChanges();

    try {
      // ✅ cache primero si existe
      const cached = (this.authApi as any).getPerfilCached?.();
      this.perfil = cached ? await cached : await this.authApi.getPerfil();

      // ✅ lista con retry (opcional)
      this.cursos = await this.withRetry(() => this.api.listar(), 2, 450);
    } catch (e: any) {
      this.errorMessage = e?.error?.message ?? 'No se pudo cargar cursos.';
      this.cursos = [];
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  async load() {
    this.loading = true;
    this.errorMessage = '';
    this.cd.detectChanges();

    try {
      this.cursos = await this.withRetry(() => this.api.listar(), 2, 350);
    } catch (e: any) {
      this.errorMessage = e?.error?.message ?? 'No se pudo listar cursos.';
      this.cursos = [];
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  openCurso(curso: any) {
    this.router.navigateByUrl(`/cursos/${curso.id_curso}`);
  }

  openCreate() {
    this.createOpen = true;
    this.editOpen = false;
    this.selected = null;
  }

  openEdit(curso: any, ev?: MouseEvent) {
    ev?.stopPropagation();
    this.selected = curso;
    this.editOpen = true;
    this.createOpen = false;
  }

  closeAll() {
    this.createOpen = false;
    this.editOpen = false;
    this.selected = null;
  }

  onCreated() {
    this.closeAll();
    void this.load();
  }

  onUpdated() {
    this.closeAll();
    void this.load();
  }

  prettyDate(value: any) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  }

  badgeClass(activo: boolean) {
    return activo ? 'badge-success' : 'badge-warning';
  }

  isAdmin() {
    return this.perfil?.rol?.codigo === 'ADMIN';
  }
}
