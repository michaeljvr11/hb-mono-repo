import { APP_INITIALIZER, ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { authInterceptor } from './core/auth/auth-interceptor';
import { AuthService } from './core/auth/auth.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideClientHydration(withEventReplay()),
    provideAnimationsAsync(),
    // First MatDatepicker usage in the app (earnings-range-selector). The
    // native adapter builds Date objects from browser-native Date parsing —
    // safe under SSR since it only touches `Date`, never `window`/`document`,
    // and the calendar overlay itself is only ever created lazily on user
    // interaction (`.open()`), which can't happen during a server render.
    provideNativeDateAdapter(),
    {
      provide: APP_INITIALIZER,
      useFactory: (auth: AuthService) => () => auth.initialize(),
      deps: [AuthService],
      multi: true,
    },
  ],
};
