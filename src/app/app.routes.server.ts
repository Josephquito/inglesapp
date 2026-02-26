import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // ✅ estáticas: puedes prerender
  { path: 'login', renderMode: RenderMode.Prerender },
  { path: 'mis-cursos', renderMode: RenderMode.Prerender },
  { path: 'cursos', renderMode: RenderMode.Prerender },
  { path: 'usuarios', renderMode: RenderMode.Prerender },
  { path: 'entidad', renderMode: RenderMode.Prerender },
  { path: 'cambiar-clave', renderMode: RenderMode.Prerender },

  // ❌ dinámicas (tienen params): NO prerender
  { path: 'cursos/:id', renderMode: RenderMode.Server },
  { path: 'curso/:id', renderMode: RenderMode.Server },
  { path: 'curso/:id_curso/evaluacion/:id_evaluacion', renderMode: RenderMode.Server },
  { path: 'rendiciones/intentos/:id_intento', renderMode: RenderMode.Server },

  // fallback: server (no prerender)
  { path: '**', renderMode: RenderMode.Server },
];
