import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout.component';
import { AuthGuard } from './auth/auth.guard';
import { GuestGuard } from './auth/guest.guard';
import { RoleGuard } from './auth/role.guard';

export const routes: Routes = [
  // 🔓 RUTA PUBLICA (sin layout)
  {
    path: 'login',
    canActivate: [GuestGuard],
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
    data: { renderMode: 'server' }, // ✅ (opcional) para evitar prerender
  },

  // 🔐 RUTAS PRIVADAS (con navbar)
  {
    path: '',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      // ✅ ahora esta será la "home"
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'mis-cursos',
        data: { renderMode: 'server' }, // ✅
      },

      {
        path: 'cambiar-clave',
        canActivate: [RoleGuard],
        data: { roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'], renderMode: 'server' }, // ✅
        loadComponent: () =>
          import('./pages/cambiar-clave/cambiar-clave.page').then((m) => m.CambiarClavePage),
      },

      {
        path: 'entidad',
        canActivate: [RoleGuard],
        data: { roles: ['ADMIN'], renderMode: 'server' }, // ✅
        loadComponent: () => import('./pages/entidad/entidad.page').then((m) => m.EntidadPage),
      },

      {
        path: 'usuarios',
        canActivate: [RoleGuard],
        data: { roles: ['ADMIN'], renderMode: 'server' }, // ✅
        loadComponent: () => import('./pages/usuarios/usuarios.page').then((m) => m.UsuariosPage),
      },

      {
        path: 'cursos',
        canActivate: [RoleGuard],
        data: { roles: ['ADMIN', 'DOCENTE'], renderMode: 'server' }, // ✅
        loadComponent: () => import('./pages/cursos/cursos.page').then((m) => m.CursosPage),
      },

      // ✅ dinámica (tiene :id) => NO prerender
      {
        path: 'cursos/:id',
        canActivate: [RoleGuard],
        data: { roles: ['ADMIN', 'DOCENTE'], renderMode: 'server' }, // ✅ clave
        loadComponent: () =>
          import('./pages/cursos/curso-detalle/curso-detalle.page').then((m) => m.CursoDetallePage),
      },

      {
        path: 'mis-cursos',
        canActivate: [RoleGuard],
        data: { roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'], renderMode: 'server' }, // ✅
        loadComponent: () =>
          import('./pages/mis-cursos/mis-cursos.page').then((m) => m.MisCursosPage),
      },

      // ✅ dinámica (tiene :id) => NO prerender
      {
        path: 'curso/:id',
        canActivate: [RoleGuard],
        data: { roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'], renderMode: 'server' }, // ✅ clave
        loadComponent: () => import('./pages/curso/curso.page').then((m) => m.CursoPage),
      },

      // ✅ dinámica (tiene :id_curso y :id_evaluacion) => NO prerender
      {
        path: 'curso/:id_curso/evaluacion/:id_evaluacion',
        canActivate: [RoleGuard],
        data: { roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'], renderMode: 'server' }, // ✅ clave
        loadComponent: () =>
          import('./pages/evaluacion/evaluacion.page').then((m) => m.EvaluacionPage),
      },

      // ✅ dinámica (tiene :id_intento) => NO prerender
      {
        path: 'rendiciones/intentos/:id_intento',
        canActivate: [RoleGuard],
        data: { roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'], renderMode: 'server' }, // ✅ clave
        loadComponent: () =>
          import('./pages/rendir-evaluacion/rendir-evaluacion.page').then(
            (m) => m.RendirEvaluacionPage,
          ),
      },
    ],
  },

  // fallback
  { path: '**', redirectTo: '', data: { renderMode: 'server' } },
];
