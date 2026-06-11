import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserResponseDto } from './dto/user-response.dto';
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

  async updateRefreshToken(id: string, hashedRefresh: string | null) {
    await this.usersRepository.update(id, {
      currentRefreshToken: hashedRefresh,
      currentRefreshTokenExp: hashedRefresh
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        : null,
    });
  }

  async getProfile(id: string): Promise<UserResponseDto> {
    const user = await this.findOneFull(id);
    if (!user) throw new NotFoundException('User not found');
    return UserToResponseDto(user);
  }
}
