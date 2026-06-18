import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@hb/shared';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleProfile } from './strategies/google.strategy';
import { User } from '../users/entities/user.entity';

// Refresh-session longevity (see Auth & Roles note): "remember me" → 30 days,
// otherwise 24 hours. The access token stays short-lived via JWT_EXPIRATION.
const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_TTL = {
  default: { expiresIn: '24h', maxAgeMs: DAY_MS },
  remember: { expiresIn: '30d', maxAgeMs: 30 * DAY_MS },
} as const;

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
    private mailService: MailService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, rememberMe, ...rest } = registerDto;

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const user = await this.usersService.create({
      email,
      password,
      ...rest,
    });

    // Send the email-verification link (best-effort — registration still
    // succeeds and the user is logged in even if email delivery is unavailable).
    await this.issueEmailVerification(user);

    // Same flow as login: issue both tokens and persist the refresh hash,
    // so a freshly registered user gets a working session immediately.
    return this.getTokensAndUpdateRefresh(user, rememberMe);
  }

  async login(loginDto: LoginDto) {
    const { email, password, rememberMe } = loginDto;

    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.getTokensAndUpdateRefresh(user, rememberMe);
  }

  async refreshTokens(userId: string, refreshToken: string, rememberMe = false) {
    const user = await this.usersService.findOneFull(userId);
    if (!user || !user.currentRefreshToken) {
      throw new ForbiddenException('Access denied');
    }

    const refreshMatches = await bcrypt.compare(refreshToken, user.currentRefreshToken);
    if (!refreshMatches) {
      throw new ForbiddenException('Invalid refresh token');
    }

    // Rotation: issue new pair, invalidate old. Preserve the original
    // remember-me choice so the session length carries across refreshes.
    return this.getTokensAndUpdateRefresh(user, rememberMe);
  }

  async validateOAuthLogin(profile: GoogleProfile) {
    if (!profile.email) {
      throw new UnauthorizedException('Google did not return an email address.');
    }

    let user = await this.usersService.findByEmail(profile.email);
    if (!user) {
      // First Google sign-in creates a verified account. The password is random
      // and unused (the user authenticates via Google) but satisfies NOT NULL;
      // they can set a real one later via the password-reset flow.
      user = await this.usersService.create({
        email: profile.email,
        password: randomBytes(32).toString('hex'),
        firstName: profile.firstName,
        lastName: profile.lastName,
        role: UserRole.CUSTOMER,
        isVerified: true,
      });
    } else if (!user.isVerified) {
      // Google has verified ownership of the address — reflect it locally.
      await this.usersService.markEmailVerified(user.id);
      user.isVerified = true;
    }

    return this.getTokensAndUpdateRefresh(user, false);
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    // Always resolve the same way — never reveal whether an address is registered.
    if (user && user.isActive) {
      const rawToken = randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
      await this.usersService.setPasswordResetToken(user.id, this.hashToken(rawToken), expires);
      await this.mailService.sendPasswordReset(user.email, rawToken);
    }
    return { message: 'If that email is registered, a reset link is on its way.' };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const user = await this.usersService.findByPasswordResetTokenHash(this.hashToken(rawToken));
    if (!user || !user.isActive || !this.isUnexpired(user.passwordResetExpires)) {
      throw new BadRequestException('This password reset link is invalid or has expired.');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.usersService.setPassword(user.id, hashedPassword);
    return { message: 'Your password has been reset. You can now log in.' };
  }

  async verifyEmail(rawToken: string) {
    const user = await this.usersService.findByEmailVerificationTokenHash(this.hashToken(rawToken));
    if (!user || !this.isUnexpired(user.emailVerificationExpires)) {
      throw new BadRequestException('This verification link is invalid or has expired.');
    }

    await this.usersService.markEmailVerified(user.id);
    return { message: 'Your email address is verified.' };
  }

  async resendVerification(userId: string) {
    const user = await this.usersService.findOneFull(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.isVerified) {
      return { message: 'Your email address is already verified.' };
    }
    await this.issueEmailVerification(user);
    return { message: 'A new verification link is on its way.' };
  }

  private async issueEmailVerification(user: User) {
    const rawToken = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
    await this.usersService.setEmailVerificationToken(user.id, this.hashToken(rawToken), expires);
    await this.mailService.sendEmailVerification(user.email, rawToken);
  }

  private async getTokensAndUpdateRefresh(user: User, rememberMe = false) {
    const ttl = rememberMe ? REFRESH_TTL.remember : REFRESH_TTL.default;
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRATION'),
    });

    const refreshToken = this.jwtService.sign(
      { ...payload, rememberMe: !!rememberMe },
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: ttl.expiresIn,
      },
    );

    const hashedRefresh = await bcrypt.hash(refreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, hashedRefresh, ttl.maxAgeMs);

    return {
      access_token: accessToken,
      refresh_token: refreshToken, // sent once; controller moves it into an httpOnly cookie
      refresh_max_age_ms: ttl.maxAgeMs, // controller mirrors this on the cookie
      user: this.toAuthUser(user),
    };
  }

  private toAuthUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isVerified: user.isVerified ?? false,
    };
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private isUnexpired(expiry?: Date | null): boolean {
    return !!expiry && expiry.getTime() > Date.now();
  }

  // Helper for strategies/guards
  async validateUser(payload: { sub: string }): Promise<User> {
    const user = await this.usersService.findOneFull(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
