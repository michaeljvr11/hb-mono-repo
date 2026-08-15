// Mirrors hb-landing's `src/app/shared/constants/image.constants.ts` (LSM-1).
// Deviation from the source: hb-landing used root-relative-less paths
// (e.g. 'logos/hb-logo.png'). `apps/web` is a routed SSR app — a relative
// asset path resolves against the *current route*, not the app root, so it
// breaks the moment it's rendered from a nested URL. These are leading-slash
// absolute paths instead, which always resolve against the origin.
export const SITE_IMAGES = {
  logo: '/logos/hb-logo.png',
  hero: '/images/hero-import-shopping.jpg',
  aboutHero: '/images/about-puzzle-pieces.png',
  servicesHero: '/images/services-shopping-cart.png',
  contactHero: '/images/contact-hero-image.jpg',
} as const;

export const cssImageUrl = (url: string) => `url('${url}')`;
