import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ILike } from 'typeorm';
import { UserRole } from '@hb/shared';
import { AdminService } from './admin.service';
import { User } from '../users/entities/user.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const REQUESTER = 'req-admin-id';

const mockUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u1',
    email: 'test@hb.com',
    role: UserRole.CUSTOMER,
    isActive: true,
    isVerified: true,
    firstName: undefined,
    lastName: undefined,
    createdAt: CREATED_AT,
    ...overrides,
  }) as User;

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AdminService', () => {
  let service: AdminService;
  let usersRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    usersRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [AdminService, { provide: getRepositoryToken(User), useValue: usersRepo }],
    }).compile();

    service = module.get(AdminService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listUsers ─────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('calls find with empty where and DESC order when no query params are provided', async () => {
      const user = mockUser();
      usersRepo.find.mockResolvedValue([user]);

      const result = await service.listUsers({});

      expect(usersRepo.find).toHaveBeenCalledWith({
        where: {},
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
    });

    it('maps results to AdminUserResponseDto shape', async () => {
      const user = mockUser({
        id: 'u1',
        email: 'mapped@hb.com',
        role: UserRole.CUSTOMER,
        isActive: true,
        isVerified: false,
        firstName: undefined,
        lastName: undefined,
        createdAt: CREATED_AT,
      });
      usersRepo.find.mockResolvedValue([user]);

      const [dto] = await service.listUsers({});

      expect(dto.id).toBe('u1');
      expect(dto.email).toBe('mapped@hb.com');
      expect(dto.isActive).toBe(true);
      expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('includes name when both firstName and lastName are present', async () => {
      const user = mockUser({ firstName: 'Jane', lastName: 'Doe' });
      usersRepo.find.mockResolvedValue([user]);

      const [dto] = await service.listUsers({});

      expect(dto.name).toBe('Jane Doe');
    });

    it('omits name when firstName or lastName is absent', async () => {
      const user = mockUser({ firstName: undefined, lastName: undefined });
      usersRepo.find.mockResolvedValue([user]);

      const [dto] = await service.listUsers({});

      expect(dto.name).toBeUndefined();
    });

    it('filters by role when role query param is provided', async () => {
      usersRepo.find.mockResolvedValue([]);

      await service.listUsers({ role: UserRole.ADMIN });

      expect(usersRepo.find).toHaveBeenCalledWith({
        where: { role: UserRole.ADMIN },
        order: { createdAt: 'DESC' },
      });
    });

    it('filters by isActive: false when isActive query param is false', async () => {
      usersRepo.find.mockResolvedValue([]);

      await service.listUsers({ isActive: false });

      expect(usersRepo.find).toHaveBeenCalledWith({
        where: { isActive: false },
        order: { createdAt: 'DESC' },
      });
    });

    it('combines role and isActive filters in the where clause', async () => {
      usersRepo.find.mockResolvedValue([]);

      await service.listUsers({ role: UserRole.VENDOR, isActive: false });

      expect(usersRepo.find).toHaveBeenCalledWith({
        where: { role: UserRole.VENDOR, isActive: false },
        order: { createdAt: 'DESC' },
      });
    });

    it('passes three ILike where conditions when search is provided', async () => {
      const user = mockUser({ email: 'jane@hb.com', firstName: 'Jane', lastName: 'Doe' });
      usersRepo.find.mockResolvedValue([user]);

      await service.listUsers({ search: 'jane' });

      const pattern = ILike('%jane%');
      expect(usersRepo.find).toHaveBeenCalledWith({
        where: [
          expect.objectContaining({ email: pattern }),
          expect.objectContaining({ firstName: pattern }),
          expect.objectContaining({ lastName: pattern }),
        ],
        order: { createdAt: 'DESC' },
      });
    });

    it('maps results correctly even when using the search code-path', async () => {
      const user = mockUser({ email: 'jane@hb.com', firstName: 'Jane', lastName: 'Doe' });
      usersRepo.find.mockResolvedValue([user]);

      const result = await service.listUsers({ search: 'jane' });

      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('jane@hb.com');
      expect(result[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('propagates the base filter into each ILike where branch when search is combined with role', async () => {
      usersRepo.find.mockResolvedValue([]);

      await service.listUsers({ search: 'admin', role: UserRole.ADMIN });

      expect(usersRepo.find).toHaveBeenCalledWith({
        where: [
          expect.objectContaining({ role: UserRole.ADMIN }),
          expect.objectContaining({ role: UserRole.ADMIN }),
          expect.objectContaining({ role: UserRole.ADMIN }),
        ],
        order: { createdAt: 'DESC' },
      });
    });

    it('returns an empty array when find returns no users', async () => {
      usersRepo.find.mockResolvedValue([]);

      const result = await service.listUsers({});

      expect(result).toEqual([]);
    });
  });

  // ─── updateUserRole ─────────────────────────────────────────────────────────

  describe('updateUserRole', () => {
    it('calls update with the new role and returns a dto reflecting the change', async () => {
      const user = mockUser({ id: 'u1', role: UserRole.CUSTOMER });
      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.updateUserRole('u1', UserRole.ADMIN, REQUESTER);

      expect(usersRepo.findOne).toHaveBeenCalledWith({ where: { id: 'u1' } });
      expect(usersRepo.update).toHaveBeenCalledWith('u1', { role: UserRole.ADMIN });
      expect(result.id).toBe('u1');
      expect(result.role).toBe(UserRole.ADMIN);
    });

    it('returns a dto with all expected fields after a role update', async () => {
      const user = mockUser({
        id: 'u2',
        email: 'vendor@hb.com',
        role: UserRole.VENDOR,
        isActive: true,
        isVerified: true,
        createdAt: CREATED_AT,
      });
      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.updateUserRole('u2', UserRole.ADMIN, REQUESTER);

      expect(result.email).toBe('vendor@hb.com');
      expect(result.isActive).toBe(true);
      expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateUserRole('missing', UserRole.ADMIN, REQUESTER),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(usersRepo.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the admin tries to change their own role', async () => {
      await expect(
        service.updateUserRole(REQUESTER, UserRole.CUSTOMER, REQUESTER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersRepo.findOne).not.toHaveBeenCalled();
      expect(usersRepo.update).not.toHaveBeenCalled();
    });
  });

  // ─── setUserActive ──────────────────────────────────────────────────────────

  describe('setUserActive', () => {
    it('calls update with the new isActive value and returns a dto reflecting the change', async () => {
      const user = mockUser({ id: 'u1', isActive: true });
      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.setUserActive('u1', false, REQUESTER);

      expect(usersRepo.findOne).toHaveBeenCalledWith({ where: { id: 'u1' } });
      expect(usersRepo.update).toHaveBeenCalledWith('u1', { isActive: false });
      expect(result.id).toBe('u1');
      expect(result.isActive).toBe(false);
    });

    it('returns updated dto with isActive: true when re-activating a user', async () => {
      const user = mockUser({ id: 'u1', isActive: false });
      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.setUserActive('u1', true, REQUESTER);

      expect(usersRepo.update).toHaveBeenCalledWith('u1', { isActive: true });
      expect(result.isActive).toBe(true);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.setUserActive('missing', false, REQUESTER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(usersRepo.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the admin tries to deactivate their own account', async () => {
      await expect(service.setUserActive(REQUESTER, false, REQUESTER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(usersRepo.findOne).not.toHaveBeenCalled();
      expect(usersRepo.update).not.toHaveBeenCalled();
    });

    it('allows an admin to re-activate their own account', async () => {
      const user = mockUser({ id: REQUESTER, isActive: false });
      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.setUserActive(REQUESTER, true, REQUESTER);

      expect(result.isActive).toBe(true);
    });
  });
});
