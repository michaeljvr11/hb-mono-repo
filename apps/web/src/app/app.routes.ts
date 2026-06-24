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


  // Protected routes (require login)
  // {
  //   path: '',
  //   canActivate: [authGuard],
  //   children: [
  //     {
  //       path: '',
  //       redirectTo: 'shop',
  //       pathMatch: 'full'
  //     },
  //     {
  //       path: 'shop',
  //       loadComponent: () => import('./features/shop/shop.component').then(m => m.ShopComponent)
  //     },
  //     {
  //       path: 'cart',
  //       loadComponent: () => import('./features/cart/cart.component').then(m => m.CartComponent)
  //     },
  //     {
  //       path: 'checkout',
  //       loadComponent: () => import('./features/checkout/checkout.component').then(m => m.CheckoutComponent)
  //     },
  //     {
  //       path: 'account',
  //       loadComponent: () => import('./features/account/account.component').then(m => m.AccountComponent)
  //     }
  //   ]
  // },

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
      { path: 'logs',      loadComponent: () => import('./features/admin/pages/admin-logs/admin-logs').then(m => m.AdminLogs) },
    ],
  },

  // Catch-all route
  {
    path: '**',
    redirectTo: 'login'
  }
];

