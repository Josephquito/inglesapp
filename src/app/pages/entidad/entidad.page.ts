import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntidadService } from '../../services/entidad.service';

import { CreateEntidadModalComponent } from '../../shared/modales/entidad/create-entidad/create-entidad.modal';
import { EditEntidadModalComponent } from '../../shared/modales/entidad/edit-entidad/edit-entidad.modal';

@Component({
  selector: 'app-entidad-page',
  standalone: true,
  imports: [CommonModule, CreateEntidadModalComponent, EditEntidadModalComponent],
  templateUrl: './entidad.page.html',
  styleUrls: ['./entidad.page.css'],
})
export class EntidadPage {
  loading = false;
  errorMessage = '';
  entidades: any[] = [];

  createOpen = false;
  editOpen = false;
  selected: any = null;

  constructor(
    private api: EntidadService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    // ✅ evita NG0100 (no cambies loading en el primer check)
    setTimeout(() => this.load(), 0);
  }

  async load() {
    this.errorMessage = '';
    this.loading = true;
    this.cd.detectChanges(); // ✅ pinta loading sin esperar click

    try {
      this.entidades = await this.api.listar();
    } catch (e: any) {
      this.errorMessage = e?.error?.message ?? 'No se pudo cargar entidades.';
      this.entidades = [];
    } finally {
      this.loading = false;
      this.cd.detectChanges(); // ✅ actualiza tabla sin esperar click
    }
  }

  openCreate() {
    this.createOpen = true;
    this.editOpen = false;
    this.selected = null;
  }

  openEdit(entidad: any) {
    this.selected = entidad;
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

  badgeClass(activo: boolean) {
    return activo ? 'badge badge-success' : 'badge badge-warning';
  }
}
