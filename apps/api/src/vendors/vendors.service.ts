import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorStatus } from '@hb/shared';
import { Vendor } from './entities/vendor.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { AdminCreateVendorDto } from './dto/admin-create-vendor.dto';
import { VendorResponseDto } from './dto/vendor-response.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,
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
      throw new ForbiddenException('You already have a vendor profile');
    }

    const vendor = this.vendorRepository.create({
      ...createDto,
      user,
      userId: user.id,
      // Auto-approve for now; switch to PENDING + admin approval when onboarding hardens.
      status: VendorStatus.APPROVED,
    });

    const saved = await this.vendorRepository.save(vendor);
    return this.toResponseDto(saved);
  }

  async updateStatus(id: string, newStatus: VendorStatus): Promise<VendorResponseDto> {
    const vendor = await this.vendorRepository.findOne({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    vendor.status = newStatus;
    const updated = await this.vendorRepository.save(vendor);
    return this.toResponseDto(updated);
  }

  async findAll(): Promise<VendorResponseDto[]> {
    const vendors = await this.vendorRepository.find();
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
