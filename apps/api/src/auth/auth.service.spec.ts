import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@hb/shared';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';

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
  let auditService: { log: jest.Mock; query: jest.Mock };
  let configService: { get: jest.Mock };

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
      countByRole: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt') };
    mailService = { sendPasswordReset: jest.fn(), sendEmailVerification: jest.fn() };
    auditService = { log: jest.fn().mockResolvedValue(undefined), query: jest.fn() };
    // Key-aware config: no ADMIN_BOOTSTRAP_SECRET and non-prod by default, so the
    // bootstrap gate is a no-op in the baseline cases. Individual tests override.
    configService = {
      get: jest.fn((key: string) =>
        key === 'ADMIN_BOOTSTRAP_SECRET' || key === 'NODE_ENV' ? undefined : 'cfg',
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: MailService, useValue: mailService },
        { provide: AuditService, useValue: auditService },
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

      await service.register({ email: 'a@b.com', password: 'password1', acceptedTerms: true });

      expect(usersService.setEmailVerificationToken).toHaveBeenCalled();
      expect(mailService.sendEmailVerification).toHaveBeenCalledWith('a@b.com', expect.any(String));
    });

    it('always creates a CUSTOMER and ignores any client-supplied role (privilege-escalation guard)', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...activeUser, isVerified: false });

      // Simulate a hand-crafted request smuggling role: 'admin' past the type system.
      await service.register({
        email: 'a@b.com',
        password: 'password1',
        acceptedTerms: true,
        role: UserRole.ADMIN,
      } as Parameters<typeof service.register>[0]);

      // The forced role must win over anything supplied by the caller: create is
      // called with CUSTOMER, never the smuggled ADMIN.
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'a@b.com', role: UserRole.CUSTOMER }),
      );
      expect(usersService.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.ADMIN }),
      );
    });

    it('logs a terms-accepted audit record tied to the new user', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...activeUser, isVerified: false });

      await service.register({ email: 'a@b.com', password: 'password1', acceptedTerms: true });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          action: 'user.terms_accepted',
          entityType: 'user',
          entityId: 'u1',
        }),
      );
    });

    it('never forwards acceptedTerms into usersService.create', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...activeUser, isVerified: false });

      await service.register({ email: 'a@b.com', password: 'password1', acceptedTerms: true });

      const calls = usersService.create.mock.calls as unknown as Array<[Record<string, unknown>]>;
      expect(calls[0][0]).not.toHaveProperty('acceptedTerms');
    });

    // ── LC-10: the acceptance record is durable, not best-effort ──────────

    it('writes termsAcceptedAt in the same insert as the account', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...activeUser, isVerified: false });

      await service.register({ email: 'a@b.com', password: 'password1', acceptedTerms: true });

      const calls = usersService.create.mock.calls as unknown as Array<[Record<string, unknown>]>;
      expect(calls[0][0].termsAcceptedAt).toBeInstanceOf(Date);
    });

    it('stamps the column and the audit metadata with the same instant', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...activeUser, isVerified: false });

      await service.register({ email: 'a@b.com', password: 'password1', acceptedTerms: true });

      const createCalls = usersService.create.mock.calls as unknown as Array<
        [{ termsAcceptedAt: Date }]
      >;
      const logCalls = auditService.log.mock.calls as unknown as Array<
        [{ metadata: { acceptedAt: string } }]
      >;
      expect(logCalls[0][0].metadata.acceptedAt).toBe(
        createCalls[0][0].termsAcceptedAt.toISOString(),
      );
    });

    // The core LC-10 guarantee: an acceptance that cannot be recorded must
    // take the registration down with it, rather than leaving a live account
    // with no proof of consent. Because the timestamp rides the account's own
    // INSERT, a failed write means no account at all.
    it('does not create an account when the acceptance write fails', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockRejectedValue(new Error('insert failed'));

      await expect(
        service.register({ email: 'a@b.com', password: 'password1', acceptedTerms: true }),
      ).rejects.toThrow('insert failed');

      // No session was minted and no verification mail went out for an
      // account that does not exist.
      expect(usersService.updateRefreshToken).not.toHaveBeenCalled();
      expect(mailService.sendEmailVerification).not.toHaveBeenCalled();
    });

    // LC-10 explicitly must not change AuditService.log semantics for its
    // existing callers: registration still succeeds when the audit write is
    // lost, because the durable record is now the user column.
    it('still registers when the best-effort audit write is lost', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...activeUser, isVerified: false });
      auditService.log.mockResolvedValue(undefined);

      const result = await service.register({
        email: 'a@b.com',
        password: 'password1',
        acceptedTerms: true,
      });

      expect(result.access_token).toBeDefined();
      const calls = usersService.create.mock.calls as unknown as Array<[{ termsAcceptedAt: Date }]>;
      expect(calls[0][0].termsAcceptedAt).toBeInstanceOf(Date);
    });
  });

  describe('bootstrapAdmin', () => {
    const adminDto = { email: 'admin@hb-ecommerce.com', password: 'SecurePass123!' };
    const adminUser = {
      id: 'a1',
      email: 'admin@hb-ecommerce.com',
      role: UserRole.ADMIN,
      isActive: true,
      isVerified: true,
    };

    it('A: throws ConflictException when an admin already exists and does not create a user', async () => {
      usersService.countByRole.mockResolvedValue(1);

      await expect(service.bootstrapAdmin(adminDto)).rejects.toThrow(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('B: creates an ADMIN user with isVerified true and returns an access_token when no admin exists', async () => {
      usersService.countByRole.mockResolvedValue(0);
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(adminUser);

      const result = await service.bootstrapAdmin(adminDto);

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@hb-ecommerce.com',
          password: 'SecurePass123!',
          role: UserRole.ADMIN,
          isVerified: true,
        }),
      );
      expect(result.access_token).toBe('signed.jwt');
      // The self-sealing bootstrap is an auditable event (card: log admin bootstrap).
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'a1',
          action: 'admin.bootstrapped',
          entityType: 'user',
          entityId: 'a1',
        }),
      );
    });

    it('C: throws BadRequestException when the email is already taken', async () => {
      usersService.countByRole.mockResolvedValue(0);
      usersService.findByEmail.mockResolvedValue(activeUser);

      await expect(service.bootstrapAdmin(adminDto)).rejects.toThrow(BadRequestException);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('D: is disabled (fails closed) in production when ADMIN_BOOTSTRAP_SECRET is unset', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'NODE_ENV' ? 'production' : undefined,
      );
      usersService.countByRole.mockResolvedValue(0);

      await expect(service.bootstrapAdmin(adminDto)).rejects.toThrow(ForbiddenException);
      expect(usersService.create).not.toHaveBeenCalled();
      // The gate runs before any DB work — the race window is closed outright.
      expect(usersService.countByRole).not.toHaveBeenCalled();
    });

    it('E: rejects a wrong/missing secret when one is configured', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'ADMIN_BOOTSTRAP_SECRET' ? 'the-real-secret' : undefined,
      );
      usersService.countByRole.mockResolvedValue(0);

      await expect(service.bootstrapAdmin(adminDto)).rejects.toThrow(ForbiddenException);
      await expect(service.bootstrapAdmin({ ...adminDto, secret: 'wrong' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('F: creates the admin when the configured secret matches', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'ADMIN_BOOTSTRAP_SECRET' ? 'the-real-secret' : undefined,
      );
      usersService.countByRole.mockResolvedValue(0);
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(adminUser);

      const result = await service.bootstrapAdmin({ ...adminDto, secret: 'the-real-secret' });

      expect(result.access_token).toBe('signed.jwt');
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.ADMIN, isVerified: true }),
      );
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

    it('rejects a Google profile whose email is not verified', async () => {
      await expect(
        service.validateOAuthLogin({ email: 'a@b.com', emailVerified: false }),
      ).rejects.toThrow(UnauthorizedException);
      expect(usersService.findByEmail).not.toHaveBeenCalled();
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('creates a verified account on first Google sign-in', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...activeUser, isVerified: true });

      await service.validateOAuthLogin({
        email: 'a@b.com',
        emailVerified: true,
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

      await service.validateOAuthLogin({ email: 'a@b.com', emailVerified: true });

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
