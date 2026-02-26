import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
  withFetch, // ✅ AÑADIR
} from '@angular/common/http';
import { TokenInterceptor } from './auth/token.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled',
      }),
    ),

    provideClientHydration(withEventReplay()),

    providePrimeNG({
      theme: { preset: Aura, options: { darkModeSelector: false || 'none' } },
    }),

    // ✅ habilita fetch + interceptores DI
    provideHttpClient(withFetch(), withInterceptorsFromDi()),

    { provide: HTTP_INTERCEPTORS, useClass: TokenInterceptor, multi: true },
  ],
};
