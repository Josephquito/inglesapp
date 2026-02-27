import { Component, ElementRef, HostListener, ViewChild, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { MenuItem } from 'primeng/api';
import { AuthService } from '../../services/auth.service';
import { UsuariosService } from '../../services/usuarios.service';

type Rol = 'ADMIN' | 'DOCENTE' | 'ESTUDIANTE';

@Component({
  selector: 'app-navbar',
  standalone: true,
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
  imports: [RouterModule, MenubarModule, ButtonModule],
})
export class NavbarComponent implements OnInit {
  mobileOpen = false;
  navVisible = true;

  private lastScrollTop = 0;
  private readonly showThreshold = 10;
  private readonly hideAfter = 80;

  @ViewChild('mobileMenu') mobileMenu!: ElementRef<HTMLElement>;

  // ✅ menú final ya filtrado
  items: MenuItem[] = [];

  // ✅ define aquí tu “catálogo” de opciones + roles permitidos
  private readonly MENU: Array<MenuItem & { roles: Rol[] }> = [
    { label: 'Mis Cursos', routerLink: '/mis-cursos', roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'] },

    { label: 'Cursos', routerLink: '/cursos', roles: ['ADMIN', 'DOCENTE'] },

    { label: 'Usuarios', routerLink: '/usuarios', roles: ['ADMIN'] },
    { label: 'Entidad', routerLink: '/entidad', roles: ['ADMIN'] },
  ];

  constructor(
    private auth: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // 👇 AJUSTA AQUÍ según tu AuthService
    // Opción A: si tienes un método getRole(): 'ADMIN' | ...
    const role = this.auth.getUserRole?.() as Rol | undefined;

    // Opción B: si manejas múltiples roles: const roles = this.auth.getRoles?.() as Rol[] ?? [];
    // y cambias hasRole(...) acorde.

    this.items = this.buildMenu(role);
  }

  private buildMenu(role?: Rol): MenuItem[] {
    if (!role) {
      // si no hay rol, por seguridad no muestres nada (o muestra solo Mis Cursos)
      return [{ label: 'Mis Cursos', routerLink: '/mis-cursos' }];
    }

    return this.MENU.filter((i) => i.roles.includes(role)).map(({ roles, ...item }) => item); // quitamos roles para dejar MenuItem puro
  }

  logout() {
    this.closeMobileMenu();
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  toggleMobileMenu() {
    this.mobileOpen = !this.mobileOpen;
    if (this.mobileOpen) this.navVisible = true;
  }

  closeMobileMenu() {
    this.mobileOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    if (!this.mobileOpen) return;

    const target = event.target as HTMLElement;
    const clickedInsideMenu = this.mobileMenu?.nativeElement.contains(target);
    const clickedHamburger = target.closest('.hamburger');

    if (!clickedInsideMenu && !clickedHamburger) {
      this.closeMobileMenu();
    }
  }

  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    const st =
      window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

    if (this.mobileOpen) {
      this.closeMobileMenu();
      this.navVisible = true;
      this.lastScrollTop = st;
      return;
    }

    if (st <= this.hideAfter) {
      this.navVisible = true;
      this.lastScrollTop = st;
      return;
    }

    const delta = st - this.lastScrollTop;
    if (Math.abs(delta) < this.showThreshold) return;

    this.navVisible = delta < 0;
    if (!this.navVisible) {
      this.closeMobileMenu();
    }
    this.lastScrollTop = st <= 0 ? 0 : st;
  }
}
