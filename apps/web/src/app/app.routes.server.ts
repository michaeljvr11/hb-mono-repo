import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Server-render everything for now. Routes behind auth render their redirect
 * shell on the server (no token there) and hydrate to the real view in the
 * browser. Mark public marketing/catalog routes Prerender as they appear.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
