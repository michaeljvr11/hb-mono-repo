import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { CountryCode, CurrencyCode, UserRole } from '@hb/shared';
import { ProductShippingFeeOverrideController } from './product-shipping-fee-override.controller';
import { ProductShippingFeeOverrideService } from './product-shipping-fee-override.service';
import { RolesGuard } from '../common/guards/roles.guard';

// @Roles(UserRole.ADMIN) is applied at class level only, so the handler
// reference itself carries no metadata — any function identity works here
// (mirrors PlatformSettingsController's guardrail test).
const noopHandler = () => undefined;

function makeContext(role: UserRole): ExecutionContext {
  return {
    getHandler: () => noopHandler,
    getClass: () => ProductShippingFeeOverrideController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('ProductShippingFeeOverrideController', () => {
  let controller: ProductShippingFeeOverrideController;
  let service: { listForProduct: jest.Mock; set: jest.Mock; clear: jest.Mock };

  beforeEach(async () => {
    service = {
      listForProduct: jest.fn().mockResolvedValue([]),
      set: jest.fn().mockResolvedValue({ id: 'override-1' }),
      clear: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      controllers: [ProductShippingFeeOverrideController],
      providers: [{ provide: ProductShippingFeeOverrideService, useValue: service }],
    }).compile();

    controller = module.get(ProductShippingFeeOverrideController);
  });

  it('refuses vendor and customer roles via the @Roles(ADMIN) metadata + RolesGuard', () => {
    const guard = new RolesGuard(new Reflector());

    expect(guard.canActivate(makeContext(UserRole.VENDOR))).toBe(false);
    expect(guard.canActivate(makeContext(UserRole.CUSTOMER))).toBe(false);
    expect(guard.canActivate(makeContext(UserRole.ADMIN))).toBe(true);
  });

  it('list() delegates to the service', async () => {
    await controller.list('product-1');
    expect(service.listForProduct).toHaveBeenCalledWith('product-1');
  });

  it('set() delegates to the service with the requesting admin id', async () => {
    const dto = {
      originCountry: CountryCode.NAMIBIA,
      destinationCountry: CountryCode.NAMIBIA,
      currency: CurrencyCode.NAD,
      amount: 50,
    };
    const requestingUser = { id: 'admin-1' } as never;

    await controller.set('product-1', dto, requestingUser);

    expect(service.set).toHaveBeenCalledWith('product-1', dto, 'admin-1');
  });

  it('clear() delegates to the service with the requesting admin id', async () => {
    const dto = {
      originCountry: CountryCode.NAMIBIA,
      destinationCountry: CountryCode.NAMIBIA,
      currency: CurrencyCode.NAD,
    };
    const requestingUser = { id: 'admin-1' } as never;

    await controller.clear('product-1', dto, requestingUser);

    expect(service.clear).toHaveBeenCalledWith('product-1', dto, 'admin-1');
  });
});
