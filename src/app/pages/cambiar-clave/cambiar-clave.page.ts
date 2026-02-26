import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UsuariosService } from '../../services/usuarios.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-cambiar-clave',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cambiar-clave.page.html',
  styleUrls: ['./cambiar-clave.page.css'],
})
export class CambiarClavePage implements OnInit, OnDestroy {
  passwordActual = '';
  nuevaPassword = '';
  confirmarPassword = '';

  showActual = false;
  showNueva = false;
  showConfirmar = false;

  loading = false;
  error: string | null = null;
  success: string | null = null;

  private isBrowser: boolean;

  constructor(
    private usuariosApi: UsuariosService,
    private auth: AuthService,
    private router: Router,
    @Inject(PLATFORM_ID) platformId: object,
    @Inject(DOCUMENT) private doc: Document,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.doc.body.classList.add('no-nav');

    if (!this.auth.isAuthenticated()) {
      this.router.navigateByUrl('/login');
      return;
    }

    // opcional: si ya NO requiere cambio, lo mandas a mis-cursos
    // (si tienes getRoleFromToken similar, podrías leer requiereCambioContrasena del token)
  }

  ngOnDestroy(): void {
    if (!this.isBrowser) return;
    this.doc.body.classList.remove('no-nav');
  }

  async submit(ev?: Event) {
    ev?.preventDefault();
    if (this.loading) return;

    this.error = null;
    this.success = null;

    const actual = this.passwordActual;
    const nueva = this.nuevaPassword;
    const conf = this.confirmarPassword;

    if (!actual || !nueva || !conf) {
      this.error = 'Completa todos los campos.';
      return;
    }
    if (nueva.length < 6) {
      this.error = 'La nueva contraseña debe tener al menos 6 caracteres.';
      return;
    }
    if (nueva !== conf) {
      this.error = 'La confirmación no coincide.';
      return;
    }
    if (nueva === actual) {
      this.error = 'La nueva contraseña no puede ser igual a la anterior.';
      return;
    }

    this.loading = true;

    try {
      const resp = await this.usuariosApi.changePassword(actual, nueva);
      this.success = resp?.mensaje ?? 'Contraseña actualizada exitosamente.';

      // ✅ importante: tu token viejo aún dice requiereCambioContrasena=true
      // Solución simple: logout y login de nuevo (o implementas endpoint que devuelva token nuevo)
      this.auth.logout();
      this.router.navigateByUrl('/login');
      // Si prefieres NO cerrar sesión, dime y te paso el endpoint que retorna token nuevo.
    } catch (err: any) {
      if (err?.status === 400) {
        this.error = err?.error?.message ?? 'Datos inválidos.';
      } else if (err?.status === 401) {
        this.error = err?.error?.message ?? 'No autorizado.';
      } else if (err?.status === 0) {
        this.error = 'No se pudo conectar al servidor (URL/CORS/backend apagado).';
      } else {
        this.error = err?.error?.message ?? err?.message ?? 'No se pudo cambiar la contraseña.';
      }
    } finally {
      this.loading = false;
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
