import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Auth-protected routes must render on the client — the server has no
  // localStorage, so guards see no token and would always redirect to /login.
  { path: 'shop', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'vendor', renderMode: RenderMode.Client },
  { path: 'vendor/**', renderMode: RenderMode.Client },
  // Public routes can be server-rendered.
  { path: '**', renderMode: RenderMode.Server },
];
