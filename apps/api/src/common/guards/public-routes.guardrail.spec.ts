import 'reflect-metadata';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppController } from '../../app.controller';
import { AuthController } from '../../auth/auth.controller';
import { CategoriesController } from '../../categories/categories.controller';
import { ProductsController } from '../../products/products.controller';
import { VendorsController } from '../../vendors/vendors.controller';
import { AdminController } from '../../admin/admin.controller';
import { UsersController } from '../../users/users.controller';
import { OrdersController } from '../../orders/orders.controller';
import { AnalyticsController } from '../../analytics/analytics.controller';

/**
 * Guardrail: authentication is on by default (global JwtAuthGuard), and a route only
 * becomes anonymous by carrying @Public(). This test pins the COMPLETE set of public
 * routes. Adding @Public() to a new route — or accidentally leaving it on — fails this
 * test until the route is added to EXPECTED_PUBLIC, forcing a conscious review.
 *
 * If you add a new controller, add it to CONTROLLERS so its routes are covered.
 * See SECURITY.md → "Adding a new route".
 */
const CONTROLLERS = [
  AppController,
  AuthController,
  CategoriesController,
  ProductsController,
  VendorsController,
  AdminController,
  UsersController,
  OrdersController,
  AnalyticsController,
];

const EXPECTED_PUBLIC = [
  'AnalyticsController.ingest',
  'AppController.health',
  'AuthController.bootstrapAdmin',
  'AuthController.forgotPassword',
  'AuthController.googleAuth',
  'AuthController.googleAuthCallback',
  'AuthController.login',
  'AuthController.refresh',
  'AuthController.register',
  'AuthController.resetPassword',
  'AuthController.verifyEmail',
  'CategoriesController.findAll',
  'CategoriesController.findOne',
  'ProductsController.getAllProducts',
  'ProductsController.getProductById',
  'VendorsController.findDirectory',
  'VendorsController.findOne',
].sort();

function collectPublicRoutes(): string[] {
  const found: string[] = [];
  for (const ctrl of CONTROLLERS) {
    const proto = ctrl.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const handler = proto[name];
      if (typeof handler !== 'function') continue;
      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) as unknown;
      if (isPublic === true) found.push(`${ctrl.name}.${name}`);
    }
  }
  return found.sort();
}

describe('Public-route guardrail', () => {
  it('exposes exactly the intended set of @Public() routes', () => {
    expect(collectPublicRoutes()).toEqual(EXPECTED_PUBLIC);
  });
});
