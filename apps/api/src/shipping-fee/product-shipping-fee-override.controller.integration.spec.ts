import { CanActivate, ExecutionContext, INestApplication, Injectable } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from '@hb/shared';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProductShippingFeeOverrideController } from './product-shipping-fee-override.controller';
import { ProductShippingFeeOverrideService } from './product-shipping-fee-override.service';

/**
 * FAIL 2 (code review): a malformed `productId` route param must 400, not
 * fall through to Postgres and surface as an unhandled 500. Only provable
 * through the real HTTP pipeline (`ParseUUIDPipe` runs as part of Nest's
 * param-binding, not when a unit test calls the controller method
 * directly) — mirrors the precedent fix for `/reviews/:id`
 * (`review.controller.ts`, commit ab01535): `new ParseUUIDPipe()` with no
 * options, which defaults to a 400 `BadRequestException` (NOT a 404, despite
 * that commit's message — there is no global exception filter remapping it;
 * verified by reading the installed `@nestjs/common` pipe source).
 *
 * Auth is faked (mirrors `synonyms-admin.integration.spec.ts`) — the REAL
 * `RolesGuard` (`@Roles(UserRole.ADMIN)` on this controller) and the real
 * `ParseUUIDPipe`s are what's under test.
 */
@Injectable()
class FakeAdminAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: { id: string; role: UserRole } }>();
    req.user = { id: 'admin-1', role: UserRole.ADMIN };
    return true;
  }
}

describe('ProductShippingFeeOverrideController (integration): malformed productId', () => {
  let app: INestApplication<App>;
  let overrideService: { listForProduct: jest.Mock; set: jest.Mock; clear: jest.Mock };

  beforeEach(async () => {
    overrideService = {
      listForProduct: jest.fn().mockResolvedValue([]),
      set: jest.fn().mockResolvedValue({ id: 'override-1' }),
      clear: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductShippingFeeOverrideController],
      providers: [
        { provide: ProductShippingFeeOverrideService, useValue: overrideService },
        { provide: APP_GUARD, useClass: FakeAdminAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET with a malformed productId returns 400, never a raw 500', async () => {
    const res = await request(app.getHttpServer()).get(
      '/admin/products/not-a-uuid/shipping-fee-overrides',
    );

    expect(res.status).toBe(400);
    expect(overrideService.listForProduct).not.toHaveBeenCalled();
  });

  it('PUT with a malformed productId returns 400, never a raw 500', async () => {
    const res = await request(app.getHttpServer())
      .put('/admin/products/not-a-uuid/shipping-fee-overrides')
      .send({ originCountry: 'ZA', destinationCountry: 'NA', currency: 'ZAR', amount: 50 });

    expect(res.status).toBe(400);
    expect(overrideService.set).not.toHaveBeenCalled();
  });

  it('DELETE with a malformed productId returns 400, never a raw 500', async () => {
    const res = await request(app.getHttpServer())
      .delete('/admin/products/not-a-uuid/shipping-fee-overrides')
      .query({ originCountry: 'ZA', destinationCountry: 'NA', currency: 'ZAR' });

    expect(res.status).toBe(400);
    expect(overrideService.clear).not.toHaveBeenCalled();
  });

  it('GET with a well-formed uuid still reaches the service (control case)', async () => {
    const res = await request(app.getHttpServer()).get(
      '/admin/products/8c9c6b0e-6a3d-4a2f-9b3a-1a2b3c4d5e6f/shipping-fee-overrides',
    );

    expect(res.status).toBe(200);
    expect(overrideService.listForProduct).toHaveBeenCalledWith(
      '8c9c6b0e-6a3d-4a2f-9b3a-1a2b3c4d5e6f',
    );
  });
});
