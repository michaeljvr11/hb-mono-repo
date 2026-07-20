import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@hb/shared';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

// bcryptjs exports are non-configurable, so spyOn can't wrap them — mock the module.
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: Record<string, jest.Mock>;

  const baseUser: User = {
    id: 'u1',
    email: 'a@b.com',
    password: 'stored-hash',
    role: UserRole.CUSTOMER,
    isActive: true,
    isVerified: true,
    firstName: 'Ada',
    lastName: 'Lovelace',
  } as User;

  beforeEach(async () => {
    usersRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: getRepositoryToken(User), useValue: usersRepository }],
    }).compile();

    service = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('updateProfile', () => {
    it('updates only firstName/lastName, never role/email/isActive/isVerified', async () => {
      usersRepository.findOne.mockResolvedValue({
        ...baseUser,
        firstName: 'Grace',
        lastName: 'Hopper',
      });

      await service.updateProfile('u1', { firstName: 'Grace', lastName: 'Hopper' });

      expect(usersRepository.update).toHaveBeenCalledWith('u1', {
        firstName: 'Grace',
        lastName: 'Hopper',
      });
      const [, updateData] = usersRepository.update.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(updateData).not.toHaveProperty('role');
      expect(updateData).not.toHaveProperty('email');
      expect(updateData).not.toHaveProperty('isActive');
      expect(updateData).not.toHaveProperty('isVerified');
    });
  });

  describe('changePassword', () => {
    it('rejects a wrong current password and does not rewrite the hash', async () => {
      usersRepository.findOne.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('u1', { currentPassword: 'wrong', newPassword: 'newpassword' }),
      ).rejects.toThrow(BadRequestException);

      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it('rewrites the hash and clears the refresh session on success', async () => {
      usersRepository.findOne.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

      await service.changePassword('u1', {
        currentPassword: 'correct',
        newPassword: 'newpassword',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 12);
      expect(usersRepository.update).toHaveBeenCalledWith('u1', {
        password: 'new-hash',
        passwordResetTokenHash: null,
        passwordResetExpires: null,
        currentRefreshToken: null,
        currentRefreshTokenExp: null,
      });
    });
  });
});
