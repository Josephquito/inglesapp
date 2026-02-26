import {
  ChangeDetectorRef,
  Component,
  Inject,
  NgZone,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { finalize, take } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.css'],
})
export class LoginPage implements OnInit, OnDestroy {
  username = '';
  password = '';
  showPassword = false;

  loading = false;
  error: string | null = null;

  private isBrowser: boolean;

  constructor(
    private auth: AuthService,
    private router: Router,
    @Inject(PLATFORM_ID) platformId: object,
    @Inject(DOCUMENT) private doc: Document,
    private cd: ChangeDetectorRef,
    private zone: NgZone,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    if (!this.isBrowser) return;
    this.doc.body.classList.add('no-nav');

    if (this.auth.isAuthenticated()) {
      this.router.navigateByUrl('/mis-cursos');
    }
  }

  ngOnDestroy() {
    if (!this.isBrowser) return;
    this.doc.body.classList.remove('no-nav');
  }

  login(ev?: Event) {
    ev?.preventDefault();
    if (this.loading) return;

    const username = this.username.trim();
    const password = this.password;

    if (!username || !password) {
      this.error = 'Ingresa usuario y contraseña';
      return;
    }

    this.loading = true;
    this.error = null;
    this.cd.detectChanges(); // 👈 asegura que el “loading” se pinte

    this.auth
      .login$(username, password)
      .pipe(
        take(1),
        finalize(() => {
          // 👇 en algunos setups, esto no refresca UI si no lo fuerzas
          this.zone.run(() => {
            this.loading = false;
            this.cd.detectChanges();
          });
        }),
      )
      .subscribe({
        next: (perfil: any) => {
          this.zone.run(() => {
            if (perfil?.requiereCambioContrasena) {
              this.router.navigateByUrl('/cambiar-clave');
              return;
            }
            this.router.navigateByUrl('/mis-cursos');
          });
        },
        error: (err: any) => {
          this.zone.run(() => {
            this.auth.logout();
            this.password = '';
            this.showPassword = false;
            this.error = this.getLoginErrorMessage(err);

            this.loading = false; // doble seguro
            this.cd.detectChanges(); // 👈 esto es lo que te faltaba
          });
        },
      });
  }

  private getLoginErrorMessage(err: any): string {
    if (err?.name === 'TimeoutError') {
      return 'El servidor tardó demasiado en responder. Intenta nuevamente.';
    }

    if (err?.status === 401) {
      return 'Credenciales incorrectas';
    }

    if (err?.status === 0) {
      return 'No se pudo conectar al servidor (URL/CORS/backend apagado)';
    }

    return (
      err?.error?.message?.[0] ?? err?.error?.message ?? err?.message ?? 'Error al iniciar sesión'
    );
  }
}
