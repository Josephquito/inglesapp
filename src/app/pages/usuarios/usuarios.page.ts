import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UsuariosService } from '../../services/usuarios.service';
import { CrearUsuarioModalComponent } from '../../shared/modales/usuarios/crear-usuario/crear-usuario.modal';
import { EditarUsuarioModalComponent } from '../../shared/modales/usuarios/editar-usuario/editar-usuario.modal';
import { AuthService } from '../../services/auth.service';

import { Subject, defer, from, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

type Vm = {
  loading: boolean;
  errorMessage: string;
  usuarios: any[];
  entidades: any[];
  roles: any[];
  perfil: any;
};

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, CrearUsuarioModalComponent, EditarUsuarioModalComponent],
  templateUrl: './usuarios.page.html',
  styleUrls: ['./usuarios.page.css'],
})
export class UsuariosPage {
  // Modales (UI local, no async)
  createOpen = false;
  editOpen = false;
  selected: any = null;

  private refresh$ = new Subject<void>();

  vm$ = this.refresh$.pipe(
    startWith(void 0),
    switchMap(() =>
      defer(() => from(this.loadVm())).pipe(
        map((data) => ({ ...data, loading: false }) as Vm),
        catchError((e: any) =>
          of({
            loading: false,
            errorMessage: e?.error?.message ?? 'No se pudo cargar usuarios.',
            usuarios: [],
            entidades: [],
            roles: [],
            perfil: null,
          } as Vm),
        ),
        startWith({
          loading: true,
          errorMessage: '',
          usuarios: [],
          entidades: [],
          roles: [],
          perfil: null,
        } as Vm),
      ),
    ),
    shareReplay(1),
  );

  constructor(
    private authApi: AuthService,
    private api: UsuariosService,
  ) {}

  // ===== CARGA PRINCIPAL =====
  private async loadVm(): Promise<Omit<Vm, 'loading'>> {
    const perfil = await this.authApi.getPerfil();

    const rol = perfil?.rol?.codigo ?? perfil?.rol;
    const isAdmin = rol === 'ADMIN';

    let entidades: any[] = [];
    let roles: any[] = [];

    if (isAdmin) {
      try {
        entidades = await this.api.listarEntidadesParaSelect();
      } catch {
        entidades = [];
      }

      try {
        roles = await this.api.listarRolesParaSelect();
      } catch {
        roles = [];
      }
    }

    const usuarios = isAdmin
      ? await this.api.listarTodos()
      : await this.api.listarUsuariosPorEntidad();

    return {
      errorMessage: '',
      usuarios,
      entidades,
      roles,
      perfil,
    };
  }

  // ===== MODALES =====
  openCreate() {
    this.createOpen = true;
    this.editOpen = false;
    this.selected = null;
  }

  openEdit(usuario: any) {
    this.selected = usuario;
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
    this.refresh$.next();
  }

  onUpdated() {
    this.closeAll();
    this.refresh$.next();
  }
}
