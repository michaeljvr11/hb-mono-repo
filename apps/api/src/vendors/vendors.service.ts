import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorStatus, UserRole } from '@hb/shared';
import { Vendor } from './entities/vendor.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { AdminCreateVendorDto } from './dto/admin-create-vendor.dto';
import { VendorResponseDto } from './dto/vendor-response.dto';
import { AdminVendorResponseDto } from './dto/admin-vendor-response.dto';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,
    private usersService: UsersService,
  ) {}

  private toResponseDto(vendor: Vendor): VendorResponseDto {
    return {
      id: vendor.id,
      businessName: vendor.businessName,
      tradingName: vendor.tradingName,
      status: vendor.status,
      countryCode: vendor.countryCode,
    };
  }

  private toAdminResponseDto(vendor: Vendor): AdminVendorResponseDto {
    return {
      id: vendor.id,
      businessName: vendor.businessName,
      tradingName: vendor.tradingName,
      status: vendor.status,
      countryCode: vendor.countryCode,
      registrationNumber: vendor.registrationNumber,
      website: vendor.website,
      description: vendor.description,
      verificationDocumentUrl: vendor.verificationDocumentUrl,
      // createdAt is a CreateDateColumn — always set on a persisted vendor.
      appliedAt: vendor.createdAt.toISOString(),
    };
  }

  async adminCreate(dto: AdminCreateVendorDto): Promise<VendorResponseDto> {
    if (dto.userId) {
      const hasVendor = await this.vendorRepository.findOne({ where: { userId: dto.userId } });
      if (hasVendor) {
        throw new ConflictException(`User ${dto.userId} already has a vendor profile`);
      }
    }

    const vendor = this.vendorRepository.create({
      ...dto,
      status: dto.status ?? VendorStatus.PENDING,
    });

    const saved = await this.vendorRepository.save(vendor);
    return this.toResponseDto(saved);
  }

  async create(createDto: CreateVendorDto, user: User): Promise<VendorResponseDto> {
    if (await this.hasVendor(user.id)) {
      throw new ConflictException('You already have a vendor profile');
    }

    const vendor = this.vendorRepository.create({
      ...createDto,
      user,
      userId: user.id,
      status: VendorStatus.PENDING,
    });

    const saved = await this.vendorRepository.save(vendor);

    if (user.role !== UserRole.VENDOR) {
      await this.usersService.update(user.id, { role: UserRole.VENDOR });
    }

    return this.toResponseDto(saved);
  }

  // Admin-only status lifecycle. Only these transitions are legal; anything else
  // (e.g. resurrecting a rejected vendor, or approving an already-approved one) is
  // refused. Enforced here in the service layer — never hand-rolled in the controller.
  private static readonly STATUS_TRANSITIONS: Readonly<
    Record<VendorStatus, readonly VendorStatus[]>
  > = {
    [VendorStatus.PENDING]: [VendorStatus.APPROVED, VendorStatus.REJECTED],
    [VendorStatus.APPROVED]: [VendorStatus.SUSPENDED],
    [VendorStatus.SUSPENDED]: [VendorStatus.APPROVED],
    [VendorStatus.REJECTED]: [],
  };

  async updateStatus(id: string, newStatus: VendorStatus): Promise<VendorResponseDto> {
    const vendor = await this.vendorRepository.findOne({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const allowed = VendorsService.STATUS_TRANSITIONS[vendor.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new ConflictException(
        `Cannot change vendor status from '${vendor.status}' to '${newStatus}'`,
      );
    }

    vendor.status = newStatus;
    const updated = await this.vendorRepository.save(vendor);
    return this.toResponseDto(updated);
  }

  async findAll(): Promise<AdminVendorResponseDto[]> {
    const vendors = await this.vendorRepository.find();
    return vendors.map((v) => this.toAdminResponseDto(v));
  }

  async findDirectory(): Promise<VendorResponseDto[]> {
    const vendors = await this.vendorRepository.find({
      where: { status: VendorStatus.APPROVED },
      order: { businessName: 'ASC' },
    });
    return vendors.map((v) => this.toResponseDto(v));
  }

  async findOne(id: string): Promise<VendorResponseDto> {
    const vendor = await this.vendorRepository.findOne({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return this.toResponseDto(vendor);
  }

  async findByUserId(userId: string): Promise<VendorResponseDto | null> {
    const vendor = await this.vendorRepository.findOne({ where: { userId } });
    return vendor ? this.toResponseDto(vendor) : null;
  }

  async update(
    id: string,
    updateDto: UpdateVendorDto,
    currentUser: User,
  ): Promise<VendorResponseDto> {
    const vendor = await this.vendorRepository.findOne({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    if (vendor.userId !== currentUser.id) {
      throw new ForbiddenException('You can only update your own vendor profile');
    }

    Object.assign(vendor, updateDto);
    const updated = await this.vendorRepository.save(vendor);
    return this.toResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    const result = await this.vendorRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('Vendor not found');
  }

  async hasVendor(userId: string): Promise<boolean> {
    return !!(await this.vendorRepository.findOne({ where: { userId } }));
  }
}
