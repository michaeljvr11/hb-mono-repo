import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddressDto } from '@hb/shared';
import { Address } from './entities/address.entity';
import { User } from '../users/entities/user.entity';
import { CreateAddressDto, UpdateAddressDto } from './dto/create-address.dto';

/**
 * Address book CRUD. Ownership pattern mirrors
 * {@link OrdersService.findOneForUser}: scope reads/writes to {id, userId} and
 * 404 (never 403) on a mismatch so we never leak whether an address exists.
 */
@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address)
    private addressesRepository: Repository<Address>,
  ) {}

  async findAllForUser(userId: string): Promise<AddressDto[]> {
    const addresses = await this.addressesRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return addresses.map((address) => this.toDto(address));
  }

  async create(userId: string, dto: CreateAddressDto): Promise<AddressDto> {
    const address = await this.addressesRepository.save(
      this.addressesRepository.create({ ...dto, userId }),
    );
    return this.toDto(address);
  }

  async update(user: User, id: string, dto: UpdateAddressDto): Promise<AddressDto> {
    const address = await this.findOwned(user.id, id);
    const updated = await this.addressesRepository.save({ ...address, ...dto });
    return this.toDto(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const address = await this.findOwned(userId, id);
    await this.addressesRepository.delete(address.id);
  }

  private async findOwned(userId: string, id: string): Promise<Address> {
    const address = await this.addressesRepository.findOne({ where: { id, userId } });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }

  private toDto(address: Address): AddressDto {
    return {
      id: address.id,
      recipientName: address.recipientName,
      line1: address.line1,
      line2: address.line2 ?? undefined,
      city: address.city,
      region: address.region ?? undefined,
      postalCode: address.postalCode ?? undefined,
      countryCode: address.countryCode,
      phone: address.phone ?? undefined,
    };
  }
}
