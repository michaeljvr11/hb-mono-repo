import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Public storefront is server-rendered for SEO and fast first paint — it reads
  // only public catalogue endpoints and is SSR-safe (no unguarded browser APIs).
  { path: 'shop', renderMode: RenderMode.Server },
  // Product discovery + detail are public catalogue pages — same SSR treatment.
  { path: 'discover', renderMode: RenderMode.Server },
  { path: 'products/:id', renderMode: RenderMode.Server },
  { path: 'vendors/:id', renderMode: RenderMode.Server },
  // Cart, checkout & wishlist are authed pages — same localStorage-guard
  // constraint as the portals below, so they render client-side.
  { path: 'cart', renderMode: RenderMode.Client },
  { path: 'checkout', renderMode: RenderMode.Client },
  { path: 'wishlist', renderMode: RenderMode.Client },
  // Same constraint as the pages above: its guard reads auth state that only
  // exists in the browser, so SSR would always bounce it to /login.
  { path: 'accept-terms', renderMode: RenderMode.Client },
  // Admin & vendor portals stay client-rendered: their route guards depend on
  // localStorage (absent on the server), so SSR would always redirect to /login.
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'vendor', renderMode: RenderMode.Client },
  { path: 'vendor/**', renderMode: RenderMode.Client },
  // Static marketing pages — no user-specific data, safe to prerender at build time.
  { path: 'about', renderMode: RenderMode.Prerender },
  { path: 'services', renderMode: RenderMode.Prerender },
  { path: 'contact', renderMode: RenderMode.Prerender },
  { path: 'legal/privacy', renderMode: RenderMode.Prerender },
  { path: 'legal/cookies', renderMode: RenderMode.Prerender },
  { path: 'legal/terms', renderMode: RenderMode.Prerender },
  { path: 'legal/shipping', renderMode: RenderMode.Prerender },
  { path: 'legal/returns', renderMode: RenderMode.Prerender },
  { path: 'legal/customs', renderMode: RenderMode.Prerender },
  { path: 'legal/vendor-agreement', renderMode: RenderMode.Prerender },
  // Remaining public routes can be server-rendered.
  { path: '**', renderMode: RenderMode.Server },
];
