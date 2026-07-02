import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Public storefront is server-rendered for SEO and fast first paint — it reads
  // only public catalogue endpoints and is SSR-safe (no unguarded browser APIs).
  { path: 'shop', renderMode: RenderMode.Server },
  // Product discovery + detail are public catalogue pages — same SSR treatment.
  { path: 'discover', renderMode: RenderMode.Server },
  { path: 'products/:id', renderMode: RenderMode.Server },
  // Admin & vendor portals stay client-rendered: their route guards depend on
  // localStorage (absent on the server), so SSR would always redirect to /login.
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'vendor', renderMode: RenderMode.Client },
  { path: 'vendor/**', renderMode: RenderMode.Client },
  // Remaining public routes can be server-rendered.
  { path: '**', renderMode: RenderMode.Server },
];
