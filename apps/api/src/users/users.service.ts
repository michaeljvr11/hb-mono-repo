import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@hb/shared';
import { User } from './entities/user.entity';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserToResponseDto } from '../common/utils/mappers.utils';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(userData: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(userData);
    return this.usersRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findOne(id: string): Promise<UserResponseDto | null> {
    const user = await this.usersRepository.findOne({ where: { id } });
    return user ? UserToResponseDto(user) : null;
  }

  async findOneFull(id: string): Promise<User | null> {
    // Internal use when password / refresh token are needed.
    return this.usersRepository.findOne({ where: { id } });
  }

  async update(id: string, updateData: Partial<User>): Promise<UserResponseDto> {
    await this.usersRepository.update(id, updateData);
    const updated = await this.findOneFull(id);
    if (!updated) throw new NotFoundException('User not found after update');
    return UserToResponseDto(updated);
  }

  async updateRefreshToken(id: string, hashedRefresh: string | null, expMs?: number) {
    const ttl = expMs ?? 7 * 24 * 60 * 60 * 1000;
    await this.usersRepository.update(id, {
      currentRefreshToken: hashedRefresh,
      currentRefreshTokenExp: hashedRefresh ? new Date(Date.now() + ttl) : null,
    });
  }

  // ── Password reset + email verification ──
  // Tokens are stored as SHA-256 hashes; lookups hash the incoming raw token.

  async findByPasswordResetTokenHash(hash: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { passwordResetTokenHash: hash } });
  }

  async findByEmailVerificationTokenHash(hash: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { emailVerificationTokenHash: hash } });
  }

  async setPasswordResetToken(id: string, hash: string | null, expires: Date | null) {
    await this.usersRepository.update(id, {
      passwordResetTokenHash: hash,
      passwordResetExpires: expires,
    });
  }

  async setEmailVerificationToken(id: string, hash: string | null, expires: Date | null) {
    await this.usersRepository.update(id, {
      emailVerificationTokenHash: hash,
      emailVerificationExpires: expires,
    });
  }

  async setPassword(id: string, hashedPassword: string) {
    // New password clears the reset token and drops the refresh session, forcing
    // a fresh login everywhere (anyone holding an old session is logged out).
    await this.usersRepository.update(id, {
      password: hashedPassword,
      passwordResetTokenHash: null,
      passwordResetExpires: null,
      currentRefreshToken: null,
      currentRefreshTokenExp: null,
    });
  }

  async countByRole(role: UserRole): Promise<number> {
    return this.usersRepository.count({ where: { role } });
  }

  async markEmailVerified(id: string) {
    await this.usersRepository.update(id, {
      isVerified: true,
      emailVerificationTokenHash: null,
      emailVerificationExpires: null,
    });
  }

  async getProfile(id: string): Promise<UserResponseDto> {
    const user = await this.findOneFull(id);
    if (!user) throw new NotFoundException('User not found');
    return UserToResponseDto(user);
  }

  // Deliberately writes only firstName/lastName — no path here can touch
  // email/role/isActive/isVerified. See users.controller.ts PATCH /users/me.
  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserResponseDto> {
    return this.update(id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.findOneFull(id);
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Pre-hash here: setPassword uses repository.update, which bypasses the
    // entity's @BeforeInsert hashing hook (same reasoning as auth.service.ts
    // resetPassword). setPassword also clears the refresh session and reset
    // tokens, logging the user out everywhere (owner-confirmed 2026-07-17).
    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);
    await this.setPassword(id, hashedPassword);
  }
}
