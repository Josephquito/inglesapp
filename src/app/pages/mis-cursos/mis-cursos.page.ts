import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { CursosService } from '../../services/cursos.service';

type MisCurso = {
  id_curso: number;
  nombre: string;
  descripcion?: string;
  fecha_inicio?: string | Date;
  fecha_fin?: string | Date;
  fecha_registro?: string | Date;
  activo?: boolean;
  entidad?: any;
  miRol?: { id_rol: number; nombre: string } | null;
};

@Component({
  selector: 'app-mis-cursos-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './mis-cursos.page.html',
  styleUrls: ['./mis-cursos.page.css'],
})
export class MisCursosPage {
  loading = false;
  errorMessage = '';
  search = '';

  cursos: MisCurso[] = [];

  constructor(
    private api: CursosService,
    private router: Router,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    setTimeout(() => this.init(), 0);
  }

  async init() {
    this.loading = true;
    this.errorMessage = '';
    this.cd.detectChanges();

    try {
      await this.load();
    } catch (e: any) {
      this.errorMessage = e?.error?.message ?? 'No se pudo cargar tus cursos.';
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
      this.cursos = await this.api.listarMisCursos();
    } catch (e: any) {
      this.errorMessage = e?.error?.message ?? 'No se pudo listar tus cursos.';
      this.cursos = [];
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  get filteredCursos(): MisCurso[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.cursos;

    return this.cursos.filter((c) => {
      const entidad = c.entidad?.nombre_comercial || c.entidad?.razon_social || '';
      const rol = c.miRol?.nombre || '';
      return (
        (c.nombre || '').toLowerCase().includes(q) ||
        (c.descripcion || '').toLowerCase().includes(q) ||
        entidad.toLowerCase().includes(q) ||
        rol.toLowerCase().includes(q)
      );
    });
  }

  async openCurso(curso: MisCurso) {
    try {
      // valida acceso (tu endpoint real)
      await this.api.detalleMiCurso(curso.id_curso);

      // ✅ ajusta si tu ruta real es otra (ej: /cursos/:id)
      this.router.navigateByUrl(`/curso/${curso.id_curso}`);
    } catch (e: any) {
      this.errorMessage = e?.error?.message ?? 'No tienes acceso a este curso.';
      this.cd.detectChanges();
    }
  }

  prettyDate(value: any) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: '2-digit' });
  }

  badgeClass(activo: boolean) {
    return activo ? 'badge-success' : 'badge-muted';
  }
}
