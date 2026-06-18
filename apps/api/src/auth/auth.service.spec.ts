import { Test } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@hb/shared';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';

// bcryptjs exports are non-configurable, so spyOn can't wrap them — mock the module.
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: Record<string, jest.Mock>;
  let jwtService: { sign: jest.Mock };
  let mailService: Record<string, jest.Mock>;

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findOneFull: jest.fn(),
      create: jest.fn(),
      updateRefreshToken: jest.fn(),
      setPasswordResetToken: jest.fn(),
      setEmailVerificationToken: jest.fn(),
      findByPasswordResetTokenHash: jest.fn(),
      findByEmailVerificationTokenHash: jest.fn(),
      setPassword: jest.fn(),
      markEmailVerified: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt') };
    mailService = { sendPasswordReset: jest.fn(), sendEmailVerification: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('cfg') } },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get(AuthService);

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashedRefresh');
  });

  afterEach(() => jest.clearAllMocks());

  const activeUser = {
    id: 'u1',
    email: 'a@b.com',
    role: UserRole.CUSTOMER,
    isActive: true,
    isVerified: true,
    password: 'stored-hash',
  };

  // The refresh-token jwt sign call (the access token is signed first).
  const refreshSignCall = (): [{ rememberMe?: boolean }, { expiresIn?: string }] =>
    jwtService.sign.mock.calls[1] as [{ rememberMe?: boolean }, { expiresIn?: string }];

  describe('remember-me refresh longevity', () => {
    it('uses a 30-day window when rememberMe is true', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);

      await service.login({ email: 'a@b.com', password: 'password1', rememberMe: true });

      expect(refreshSignCall()[0].rememberMe).toBe(true);
      expect(refreshSignCall()[1].expiresIn).toBe('30d');
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        'u1',
        'hashedRefresh',
        30 * DAY_MS,
      );
    });

    it('uses a 24-hour window by default', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);

      await service.login({ email: 'a@b.com', password: 'password1', rememberMe: false });

      expect(refreshSignCall()[1].expiresIn).toBe('24h');
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith('u1', 'hashedRefresh', DAY_MS);
    });
  });

  describe('register', () => {
    it('sends a verification email for the new account', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...activeUser, isVerified: false });

      await service.register({ email: 'a@b.com', password: 'password1' });

      expect(usersService.setEmailVerificationToken).toHaveBeenCalled();
      expect(mailService.sendEmailVerification).toHaveBeenCalledWith('a@b.com', expect.any(String));
    });
  });

  describe('forgotPassword', () => {
    it('issues a reset token and emails the link for a known user', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);

      const result = await service.forgotPassword('a@b.com');

      expect(usersService.setPasswordResetToken).toHaveBeenCalledWith(
        'u1',
        expect.any(String),
        expect.any(Date),
      );
      expect(mailService.sendPasswordReset).toHaveBeenCalledWith('a@b.com', expect.any(String));
      expect(result.message).toContain('reset link');
    });

    it('does not reveal whether an unknown email is registered', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword('nobody@b.com');

      expect(usersService.setPasswordResetToken).not.toHaveBeenCalled();
      expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
      expect(result.message).toContain('reset link');
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown token', async () => {
      usersService.findByPasswordResetTokenHash.mockResolvedValue(null);
      await expect(service.resetPassword('tok', 'newpassword')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an expired token', async () => {
      usersService.findByPasswordResetTokenHash.mockResolvedValue({
        id: 'u1',
        passwordResetExpires: new Date(Date.now() - 1000),
      });
      await expect(service.resetPassword('tok', 'newpassword')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a reset for a deactivated account', async () => {
      usersService.findByPasswordResetTokenHash.mockResolvedValue({
        id: 'u1',
        isActive: false,
        passwordResetExpires: new Date(Date.now() + 60_000),
      });
      await expect(service.resetPassword('tok', 'newpassword')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('stores a freshly hashed password for a valid token', async () => {
      usersService.findByPasswordResetTokenHash.mockResolvedValue({
        id: 'u1',
        isActive: true,
        passwordResetExpires: new Date(Date.now() + 60_000),
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

      const result = await service.resetPassword('tok', 'newpassword');

      expect(usersService.setPassword).toHaveBeenCalledWith('u1', 'new-hash');
      expect(result.message).toContain('reset');
    });
  });

  describe('validateOAuthLogin (Google)', () => {
    it('rejects a profile without an email', async () => {
      await expect(service.validateOAuthLogin({})).rejects.toThrow(UnauthorizedException);
    });

    it('creates a verified account on first Google sign-in', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...activeUser, isVerified: true });

      await service.validateOAuthLogin({
        email: 'a@b.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
      });

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'a@b.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          isVerified: true,
        }),
      );
      expect(usersService.updateRefreshToken).toHaveBeenCalled();
    });

    it('verifies an existing-but-unverified local account', async () => {
      usersService.findByEmail.mockResolvedValue({ ...activeUser, isVerified: false });

      await service.validateOAuthLogin({ email: 'a@b.com' });

      expect(usersService.markEmailVerified).toHaveBeenCalledWith('u1');
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('rejects an invalid token', async () => {
      usersService.findByEmailVerificationTokenHash.mockResolvedValue(null);
      await expect(service.verifyEmail('tok')).rejects.toThrow(BadRequestException);
    });

    it('marks the user verified for a valid token', async () => {
      usersService.findByEmailVerificationTokenHash.mockResolvedValue({
        id: 'u1',
        emailVerificationExpires: new Date(Date.now() + 60_000),
      });

      const result = await service.verifyEmail('tok');

      expect(usersService.markEmailVerified).toHaveBeenCalledWith('u1');
      expect(result.message).toContain('verified');
    });
  });
});
