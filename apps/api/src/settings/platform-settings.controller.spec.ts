import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@hb/shared';
import { PlatformSettingsController } from './platform-settings.controller';
import { PlatformSettingsService } from './platform-settings.service';
import { RolesGuard } from '../common/guards/roles.guard';

// @Roles(UserRole.ADMIN) is applied at class level only, so the handler
// reference itself carries no metadata — any function identity works here.
const noopHandler = () => undefined;

function makeContext(role: UserRole): ExecutionContext {
  return {
    getHandler: () => noopHandler,
    getClass: () => PlatformSettingsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('PlatformSettingsController', () => {
  let controller: PlatformSettingsController;
  let service: { get: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    service = {
      get: jest.fn().mockResolvedValue({ notificationEmails: [] }),
      update: jest.fn().mockResolvedValue({ notificationEmails: ['ops@hb.example'] }),
    };

    const module = await Test.createTestingModule({
      controllers: [PlatformSettingsController],
      providers: [{ provide: PlatformSettingsService, useValue: service }],
    }).compile();

    controller = module.get(PlatformSettingsController);
  });

  it('refuses vendor and customer roles via the @Roles(ADMIN) metadata + RolesGuard', () => {
    const guard = new RolesGuard(new Reflector());

    expect(guard.canActivate(makeContext(UserRole.VENDOR))).toBe(false);
    expect(guard.canActivate(makeContext(UserRole.CUSTOMER))).toBe(false);
    expect(guard.canActivate(makeContext(UserRole.ADMIN))).toBe(true);
  });

  it('get() delegates to the service', async () => {
    const result = await controller.get();

    expect(service.get).toHaveBeenCalled();
    expect(result).toEqual({ notificationEmails: [] });
  });

  it('update() delegates to the service with the requesting admin id', async () => {
    const dto = { notificationEmails: ['ops@hb.example'] };
    const requestingUser = { id: 'admin-1' } as never;

    const result = await controller.update(dto, requestingUser);

    expect(service.update).toHaveBeenCalledWith(dto, 'admin-1');
    expect(result).toEqual({ notificationEmails: ['ops@hb.example'] });
  });
});
