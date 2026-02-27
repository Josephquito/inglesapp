import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
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
  createOpen = false;
  editOpen = false;
  selected: any = null;

  private refresh$ = new Subject<void>();
  private isBrowser: boolean;

  vm$ = this.refresh$.pipe(
    startWith(void 0),
    switchMap(() => {
      // ✅ En SSR NO cargamos nada (evita "No autenticado")
      if (!this.isBrowser) {
        return of({
          loading: true,
          errorMessage: '',
          usuarios: [],
          entidades: [],
          roles: [],
          perfil: null,
        } as Vm);
      }

      // ✅ En browser sí cargamos
      return defer(() => from(this.loadVmWithRetry())).pipe(
        map((data) => ({ ...data, loading: false }) as Vm),
        catchError((e: any) =>
          of({
            loading: false,
            errorMessage: e?.error?.message ?? e?.message ?? 'No se pudo cargar usuarios.',
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
      );
    }),
    shareReplay(1),
  );

  constructor(
    private authApi: AuthService,
    private api: UsuariosService,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  private async sleep(ms: number) {
    await new Promise((r) => setTimeout(r, ms));
  }

  private isTransientError(e: any): boolean {
    const status = e?.status ?? e?.error?.status ?? 0;
    return status === 0 || status === 502 || status === 503 || status === 504;
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 350): Promise<T> {
    let lastErr: any;
    for (let i = 0; i <= attempts; i++) {
      try {
        return await fn();
      } catch (e: any) {
        lastErr = e;
        const status = e?.status ?? e?.error?.status ?? 0;

        // ❌ no reintentar auth errors
        if (status === 401 || status === 403) throw e;

        // ✅ si es el error local de AuthService ("No autenticado") en un primer tick,
        // lo tratamos como transitorio (a veces pasa en hydration)
        const msg = (e?.error?.message ?? e?.message ?? '').toString().toLowerCase();
        const looksLikeLocalNoAuth = msg.includes('no autentic');

        const transient = this.isTransientError(e) || looksLikeLocalNoAuth;
        if (!transient || i === attempts) break;

        await this.sleep(delayMs);
      }
    }
    throw lastErr;
  }

  private async getPerfilSafe() {
    // ✅ cache primero si existe
    const cachedGetter = (this.authApi as any).getPerfilCached?.bind(this.authApi);
    if (cachedGetter) return await cachedGetter();

    // ✅ retry suave
    return await this.withRetry(() => this.authApi.getPerfil(), 2, 250);
  }

  private async loadVmWithRetry(): Promise<Omit<Vm, 'loading'>> {
    const perfil = await this.getPerfilSafe();

    const rol = perfil?.rol?.codigo ?? perfil?.rol;
    const isAdmin = String(rol).toUpperCase() === 'ADMIN';

    let entidades: any[] = [];
    let roles: any[] = [];

    if (isAdmin) {
      try {
        entidades = await this.withRetry(() => this.api.listarEntidadesParaSelect(), 1, 250);
      } catch {
        entidades = [];
      }

      try {
        roles = await this.withRetry(() => this.api.listarRolesParaSelect(), 1, 250);
      } catch {
        roles = [];
      }
    }

    const usuarios = await this.withRetry(
      () => (isAdmin ? this.api.listarTodos() : this.api.listarUsuariosPorEntidad()),
      2,
      450,
    );

    return {
      errorMessage: '',
      usuarios: Array.isArray(usuarios) ? usuarios : [],
      entidades,
      roles,
      perfil,
    };
  }

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
