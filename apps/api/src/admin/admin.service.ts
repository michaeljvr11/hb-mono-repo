import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { UserRole } from '@hb/shared';
import { User } from '../users/entities/user.entity';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';

function toAdminDto(user: User): AdminUserResponseDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}`.trim() : undefined,
    role: user.role,
    isVerified: user.isVerified,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async listUsers(query: AdminUserQueryDto): Promise<AdminUserResponseDto[]> {
    const base: FindOptionsWhere<User> = {};
    if (query.role !== undefined) base.role = query.role;
    if (query.isActive !== undefined) base.isActive = query.isActive;

    let users: User[];
    if (query.search) {
      const pattern = ILike(`%${query.search}%`);
      users = await this.usersRepository.find({
        where: [
          { ...base, email: pattern },
          { ...base, firstName: pattern },
          { ...base, lastName: pattern },
        ],
        order: { createdAt: 'DESC' },
      });
    } else {
      users = await this.usersRepository.find({
        where: base,
        order: { createdAt: 'DESC' },
      });
    }
    return users.map(toAdminDto);
  }

  async updateUserRole(
    id: string,
    role: UserRole,
    requestingUserId: string,
  ): Promise<AdminUserResponseDto> {
    if (id === requestingUserId) {
      throw new BadRequestException('Admins cannot change their own role');
    }
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.usersRepository.update(id, { role });
    return { ...toAdminDto(user), role };
  }

  async setUserActive(
    id: string,
    isActive: boolean,
    requestingUserId: string,
  ): Promise<AdminUserResponseDto> {
    if (id === requestingUserId && !isActive) {
      throw new BadRequestException('Admins cannot deactivate their own account');
    }
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.usersRepository.update(id, { isActive });
    return { ...toAdminDto(user), isActive };
  }
}
