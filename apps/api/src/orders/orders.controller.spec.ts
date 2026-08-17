import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@hb/shared';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RolesGuard } from '../common/guards/roles.guard';

// @Roles(UserRole.ADMIN) is applied at method level on these two handlers
// (OrdersController has no class-level @Roles — most of its routes are
// open to any authenticated role). Reflector reads metadata off the exact
// function reference the decorator was applied to, so getHandler() must
// return the prototype method itself, not a bound copy.
function makeContext(handler: (...args: unknown[]) => unknown, role: UserRole): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => OrdersController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

// Read the raw function value via the property descriptor (rather than
// `OrdersController.prototype.<method>`) so we get the exact object the
// @Roles() decorator attached its metadata to, without tripping
// @typescript-eslint/unbound-method (which only flags typed method
// references, not this untyped descriptor lookup).
function prototypeHandler(name: keyof OrdersController): (...args: unknown[]) => unknown {
  return Object.getOwnPropertyDescriptor(OrdersController.prototype, name).value as (
    ...args: unknown[]
  ) => unknown;
}

describe('OrdersController — admin override routes', () => {
  let controller: OrdersController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      overrideStatus: jest.fn(),
      findOverridesForOrder: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: service }],
    }).compile();

    controller = module.get(OrdersController);
  });

  it('gates PATCH :id/status-override to ADMIN via @Roles metadata + RolesGuard', () => {
    const guard = new RolesGuard(new Reflector());
    const handler = prototypeHandler('overrideStatus');

    expect(guard.canActivate(makeContext(handler, UserRole.CUSTOMER))).toBe(false);
    expect(guard.canActivate(makeContext(handler, UserRole.VENDOR))).toBe(false);
    expect(guard.canActivate(makeContext(handler, UserRole.ADMIN))).toBe(true);
  });

  it('gates GET :id/status-overrides to ADMIN via @Roles metadata + RolesGuard', () => {
    const guard = new RolesGuard(new Reflector());
    const handler = prototypeHandler('getStatusOverrides');

    expect(guard.canActivate(makeContext(handler, UserRole.CUSTOMER))).toBe(false);
    expect(guard.canActivate(makeContext(handler, UserRole.VENDOR))).toBe(false);
    expect(guard.canActivate(makeContext(handler, UserRole.ADMIN))).toBe(true);
  });

  it('overrideStatus delegates to the service', async () => {
    const user = { id: 'admin-1' } as never;
    const dto = { status: 'confirmed', reason: 'test', sendNotifications: false } as never;
    service.overrideStatus.mockResolvedValue({ id: 'order-1' });

    const result = await controller.overrideStatus(user, 'order-1', dto);

    expect(service.overrideStatus).toHaveBeenCalledWith(user, 'order-1', dto);
    expect(result).toEqual({ id: 'order-1' });
  });

  it('getStatusOverrides delegates to the service', async () => {
    service.findOverridesForOrder.mockResolvedValue([]);

    const result = await controller.getStatusOverrides('order-1');

    expect(service.findOverridesForOrder).toHaveBeenCalledWith('order-1');
    expect(result).toEqual([]);
  });
});
