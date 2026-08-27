import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth-guard';
import { roleGuard } from './core/auth/guards/role-guard';

export const routes: Routes = [
  // Public Auth Routes (no guard)
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login').then(m => m.Login)
  },
  {
    path: 'register',
    loadComponent: () => import('./auth/register/register').then(m => m.Register)
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./auth/forgot-password/forgot-password').then(m => m.ForgotPassword)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./auth/reset-password/reset-password').then(m => m.ResetPassword)
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./auth/verify-email/verify-email').then(m => m.VerifyEmail)
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./auth/callback/auth-callback').then(m => m.AuthCallback)
  },
  {
    path: '',
    redirectTo: 'shop',
    pathMatch: 'full'
  },
  // Public storefront — anonymous browsing (no guard). The auth boundary sits
  // at add-to-cart / checkout, not at browse. See [[Public Storefront & SSR]].
  {
    path: 'shop',
    loadComponent: () => import('./features/shop/shop').then(m => m.Shop)
  },
  // Product discovery (search/browse) — URL-driven, shareable, no guard.
  {
    path: 'discover',
    loadComponent: () => import('./features/discover/discover').then(m => m.Discover)
  },
  // Product detail — public, no guard. Cart action gates on auth inline.
  {
    path: 'products/:id',
    loadComponent: () => import('./features/product-detail/product-detail').then(m => m.ProductDetail)
  },
  // Public vendor profile / storefront — public, no guard. Only APPROVED
  // vendors are ever returned by the underlying endpoint.
  {
    path: 'vendors/:id',
    loadComponent: () => import('./features/vendors/vendor-profile/vendor-profile').then(m => m.PublicVendorProfile)
  },

  // Cart & checkout — the auth boundary of the storefront. Anonymous visits
  // bounce to /login with a returnUrl (authGuard) and come straight back.
  {
    path: 'cart',
    canActivate: [authGuard],
    loadComponent: () => import('./features/cart/cart').then(m => m.Cart)
  },
  {
    path: 'checkout',
    canActivate: [authGuard],
    loadComponent: () => import('./features/checkout/checkout').then(m => m.Checkout)
  },
  // Wishlist — any authenticated role (no roleGuard), same auth boundary as cart.
  {
    path: 'wishlist',
    canActivate: [authGuard],
    loadComponent: () => import('./features/wishlist/wishlist').then(m => m.Wishlist)
  },

  // Vendor onboarding — auth-only (no roleGuard); must be before the role-gated 'vendor' block
  {
    path: 'vendor/apply',
    canActivate: [authGuard],
    loadComponent: () => import('./features/vendor/onboarding/vendor-onboarding').then(m => m.VendorOnboarding),
  },

  // Vendor Portal (protected + role-based)
  {
    path: 'vendor',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['vendor'] },
    loadComponent: () => import('./features/vendor/vendor-shell/vendor-shell').then(m => m.VendorShell),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/vendor/pages/vendor-dashboard/vendor-dashboard').then(m => m.VendorDashboard) },
      { path: 'earnings',  loadComponent: () => import('./features/vendor/pages/vendor-earnings/vendor-earnings').then(m => m.VendorEarnings) },
      { path: 'products',  loadComponent: () => import('./features/vendor/pages/vendor-products/vendor-products').then(m => m.VendorProducts) },
      { path: 'orders',    loadComponent: () => import('./features/vendor/pages/vendor-orders/vendor-orders').then(m => m.VendorOrders) },
      { path: 'profile',   loadComponent: () => import('./features/vendor/pages/vendor-profile/vendor-profile').then(m => m.VendorProfile) },
    ],
  },

  // Admin Portal (protected + role-based)
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
    loadComponent: () => import('./features/admin/admin-shell/admin-shell').then(m => m.AdminShell),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/admin/pages/admin-dashboard/admin-dashboard').then(m => m.AdminDashboard) },
      { path: 'vendors',   loadComponent: () => import('./features/admin/pages/admin-vendors/admin-vendors').then(m => m.AdminVendors) },
      { path: 'catalog',   loadComponent: () => import('./features/admin/pages/admin-catalog/admin-catalog').then(m => m.AdminCatalog) },
      { path: 'users',     loadComponent: () => import('./features/admin/pages/admin-users/admin-users').then(m => m.AdminUsers) },
      { path: 'orders',    loadComponent: () => import('./features/admin/pages/admin-orders/admin-orders').then(m => m.AdminOrders) },
      { path: 'search-synonyms', loadComponent: () => import('./features/admin/pages/admin-search-synonyms/admin-search-synonyms').then(m => m.AdminSearchSynonyms) },
      { path: 'commission-rates', loadComponent: () => import('./features/admin/pages/admin-commission/admin-commission').then(m => m.AdminCommission) },
      { path: 'shipping-fee', loadComponent: () => import('./features/admin/pages/admin-shipping-fee/admin-shipping-fee').then(m => m.AdminShippingFee) },
      { path: 'earnings', loadComponent: () => import('./features/admin/pages/admin-earnings/admin-earnings').then(m => m.AdminEarnings) },
      { path: 'logs',      loadComponent: () => import('./features/admin/pages/admin-logs/admin-logs').then(m => m.AdminLogs) },
      { path: 'settings',  loadComponent: () => import('./features/admin/pages/admin-settings/admin-settings').then(m => m.AdminSettings) },
    ],
  },

  // Customer Profile — authenticated, any role (no roleGuard: owner-confirmed).
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile-shell/profile-shell').then(m => m.ProfileShell),
    children: [
      { path: '', redirectTo: 'details', pathMatch: 'full' },
      { path: 'details',   loadComponent: () => import('./features/profile/pages/profile-details/profile-details').then(m => m.ProfileDetails) },
      { path: 'orders',    loadComponent: () => import('./features/profile/pages/profile-orders/profile-orders').then(m => m.ProfileOrders) },
      { path: 'addresses', loadComponent: () => import('./features/profile/pages/profile-addresses/profile-addresses').then(m => m.ProfileAddresses) },
    ],
  },

  // Marketing pages — public, static, no guard.
  {
    path: 'about',
    loadComponent: () => import('./features/about/about').then(m => m.About)
  },
  {
    path: 'services',
    loadComponent: () => import('./features/services/services').then(m => m.Services)
  },
  {
    path: 'contact',
    loadComponent: () => import('./features/contact/contact').then(m => m.Contact)
  },
  {
    path: 'legal/privacy',
    loadComponent: () => import('./features/legal/privacy-policy/privacy-policy').then(m => m.PrivacyPolicy)
  },
  {
    path: 'legal/cookies',
    loadComponent: () => import('./features/legal/cookie-policy/cookie-policy').then(m => m.CookiePolicy)
  },
  {
    path: 'legal/terms',
    loadComponent: () => import('./features/legal/terms-of-service/terms-of-service').then(m => m.TermsOfService)
  },
  {
    path: 'legal/shipping',
    loadComponent: () => import('./features/legal/shipping-policy/shipping-policy').then(m => m.ShippingPolicy)
  },
  {
    path: 'legal/returns',
    loadComponent: () => import('./features/legal/returns-policy/returns-policy').then(m => m.ReturnsPolicy)
  },
  {
    path: 'legal/customs',
    loadComponent: () => import('./features/legal/export-customs/export-customs').then(m => m.ExportCustoms)
  },

  // Catch-all route
  {
    path: '**',
    redirectTo: 'login'
  }
];

