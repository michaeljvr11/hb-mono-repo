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
    path: '',
    redirectTo: 'shop',
    pathMatch: 'full'
  },
  {
    path: 'shop',
    canActivate: [authGuard],
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

  // Vendor Portal (protected + role-based)
  // {
  //   path: 'vendor',
  //   canActivate: [authGuard, roleGuard],
  //   data: { roles: ['vendor'] },
  //   loadComponent: () => import('./features/vendor/vendor.component').then(m => m.VendorComponent)
  // },

  // Catch-all route
  {
    path: '**',
    redirectTo: 'login'
  }
];

