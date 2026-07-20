import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CountryCode, UserRole } from '@hb/shared';
import { AddressesService } from './addresses.service';
import { Address } from './entities/address.entity';
import { User } from '../users/entities/user.entity';
import { CreateAddressDto, UpdateAddressDto } from './dto/create-address.dto';

const NOW = new Date('2026-07-17T09:00:00.000Z');

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'customer@hb.com',
    role: UserRole.CUSTOMER,
    isActive: true,
    isVerified: true,
    ...overrides,
  } as User;
}

function makeAddress(overrides: Partial<Address> = {}): Address {
  return {
    id: 'addr-1',
    userId: 'user-1',
    recipientName: 'Johannes Shipanga',
    line1: '12 Independence Ave',
    city: 'Windhoek',
    region: 'Khomas',
    countryCode: CountryCode.NAMIBIA,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Address;
}

const CREATE_DTO: CreateAddressDto = {
  recipientName: 'Johannes Shipanga',
  line1: '12 Independence Ave',
  city: 'Windhoek',
  region: 'Khomas',
  countryCode: CountryCode.NAMIBIA,
};

describe('AddressesService', () => {
  let service: AddressesService;
  let addressesRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    addressesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((v: Partial<Address>) => v as Address),
      save: jest.fn((v: Partial<Address>) => Promise.resolve({ ...v, id: v.id ?? 'addr-1' })),
      delete: jest.fn(() => Promise.resolve()),
    };

    const module = await Test.createTestingModule({
      providers: [
        AddressesService,
        { provide: getRepositoryToken(Address), useValue: addressesRepo },
      ],
    }).compile();

    service = module.get(AddressesService);
  });

  describe('create', () => {
    it("persists the address with the caller's userId", async () => {
      const dto = await service.create('user-1', CREATE_DTO);

      expect(addressesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ...CREATE_DTO, userId: 'user-1' }),
      );
      expect(dto).toMatchObject({ recipientName: CREATE_DTO.recipientName, city: CREATE_DTO.city });
    });
  });

  describe('findAllForUser', () => {
    it("returns only the caller's addresses", async () => {
      addressesRepo.find.mockResolvedValue([makeAddress()]);

      const result = await service.findAllForUser('user-1');

      expect(addressesRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('addr-1');
    });
  });

  describe('update', () => {
    it('updates an owned address', async () => {
      addressesRepo.findOne.mockResolvedValue(makeAddress());
      const dto: UpdateAddressDto = { city: 'Swakopmund' };

      const result = await service.update(makeUser(), 'addr-1', dto);

      expect(addressesRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'addr-1', userId: 'user-1' },
      });
      expect(result.city).toBe('Swakopmund');
    });

    it('404s on a missing or non-owned address (lookup scoped to {id, userId})', async () => {
      addressesRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(makeUser({ id: 'someone-else' }), 'addr-1', { city: 'Nowhere' }),
      ).rejects.toMatchObject({ constructor: NotFoundException, message: 'Address not found' });

      expect(addressesRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'addr-1', userId: 'someone-else' },
      });
      expect(addressesRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an owned address', async () => {
      addressesRepo.findOne.mockResolvedValue(makeAddress());

      await service.remove('user-1', 'addr-1');

      expect(addressesRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'addr-1', userId: 'user-1' },
      });
      expect(addressesRepo.delete).toHaveBeenCalledWith('addr-1');
    });

    it('404s on a missing or non-owned address', async () => {
      addressesRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('someone-else', 'addr-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(addressesRepo.delete).not.toHaveBeenCalled();
    });
  });
});
