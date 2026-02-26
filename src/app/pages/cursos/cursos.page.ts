import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

import { CursosService } from '../../services/cursos.service';
import { UsuariosService } from '../../services/usuarios.service';

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
  ) {}

  ngOnInit() {
    setTimeout(() => this.init(), 0);
  }

  async init() {
    this.loading = true;
    this.errorMessage = '';
    this.cd.detectChanges();

    try {
      this.perfil = await this.authApi.getPerfil();
      await this.load();
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
      this.cursos = await this.api.listar();
    } catch (e: any) {
      this.errorMessage = e?.error?.message ?? 'No se pudo listar cursos.';
      this.cursos = [];
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  // navegación: fila seleccionable
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
    this.load();
  }

  onUpdated() {
    this.closeAll();
    this.load();
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
