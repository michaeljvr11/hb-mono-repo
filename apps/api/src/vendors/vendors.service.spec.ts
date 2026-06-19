import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { VendorStatus } from '@hb/shared';
import { VendorsService } from './vendors.service';
import { Vendor } from './entities/vendor.entity';

const mockVendor = (overrides: Partial<Vendor> = {}): Vendor =>
  ({
    id: 'v1',
    businessName: 'Roots & Shoots Art',
    tradingName: 'Roots & Shoots',
    status: VendorStatus.APPROVED,
    countryCode: 'ZA',
    ...overrides,
  }) as Vendor;

describe('VendorsService', () => {
  let service: VendorsService;
  let vendorRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    vendorRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [VendorsService, { provide: getRepositoryToken(Vendor), useValue: vendorRepo }],
    }).compile();

    service = module.get(VendorsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('calls vendorRepository.find() and maps results to the admin shape', async () => {
      const vendor = mockVendor({
        id: 'v1',
        businessName: 'Kalahari Naturals',
        tradingName: 'Kalahari',
        status: VendorStatus.PENDING,
        countryCode: 'ZA',
        registrationNumber: 'ZA/2024/001',
        website: 'https://kalahari.co.za',
        description: 'Natural products',
        verificationDocumentUrl: 'https://cdn.hb.com/docs/za2024001.pdf',
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
      });
      vendorRepo.find.mockResolvedValue([vendor]);

      const result = await service.findAll();

      expect(vendorRepo.find).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].registrationNumber).toBe('ZA/2024/001');
      expect(result[0].verificationDocumentUrl).toBe('https://cdn.hb.com/docs/za2024001.pdf');
      expect(result[0].appliedAt).toBe('2026-06-01T10:00:00.000Z');
    });

    it('returns an empty array when no vendors exist', async () => {
      vendorRepo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    // The legal transitions, per [[Listing Types & Vendor Rules]]:
    // pending→approved, pending→rejected, approved→suspended, suspended→approved.
    const valid: ReadonlyArray<[VendorStatus, VendorStatus]> = [
      [VendorStatus.PENDING, VendorStatus.APPROVED],
      [VendorStatus.PENDING, VendorStatus.REJECTED],
      [VendorStatus.APPROVED, VendorStatus.SUSPENDED],
      [VendorStatus.SUSPENDED, VendorStatus.APPROVED],
    ];

    it.each(valid)('persists the new status for %s → %s', async (from, to) => {
      const vendor = mockVendor({ id: 'v1', status: from });
      vendorRepo.findOne.mockResolvedValue(vendor);
      vendorRepo.save.mockImplementation((v: Vendor) => Promise.resolve(v));

      const result = await service.updateStatus('v1', to);

      expect(vendorRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'v1', status: to }),
      );
      expect(result.status).toBe(to);
    });

    // Anything outside the table above is illegal — including re-approving an already
    // approved vendor, resurrecting a rejected one, or suspending a pending one.
    const invalid: ReadonlyArray<[VendorStatus, VendorStatus]> = [
      [VendorStatus.PENDING, VendorStatus.SUSPENDED],
      [VendorStatus.APPROVED, VendorStatus.APPROVED],
      [VendorStatus.APPROVED, VendorStatus.REJECTED],
      [VendorStatus.SUSPENDED, VendorStatus.REJECTED],
      [VendorStatus.SUSPENDED, VendorStatus.SUSPENDED],
      [VendorStatus.REJECTED, VendorStatus.APPROVED],
      [VendorStatus.REJECTED, VendorStatus.SUSPENDED],
    ];

    it.each(invalid)('rejects the illegal transition %s → %s with 409', async (from, to) => {
      const vendor = mockVendor({ id: 'v1', status: from });
      vendorRepo.findOne.mockResolvedValue(vendor);

      await expect(service.updateStatus('v1', to)).rejects.toBeInstanceOf(ConflictException);
      expect(vendorRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the vendor does not exist', async () => {
      vendorRepo.findOne.mockResolvedValue(null);

      await expect(service.updateStatus('missing', VendorStatus.APPROVED)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(vendorRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findDirectory', () => {
    it('queries only APPROVED vendors ordered by businessName ascending', async () => {
      const approved = [
        mockVendor({ id: 'v1', businessName: 'Kalahari Naturals', status: VendorStatus.APPROVED }),
        mockVendor({ id: 'v2', businessName: 'Roots & Shoots Art', status: VendorStatus.APPROVED }),
      ];
      vendorRepo.find.mockResolvedValue(approved);

      await service.findDirectory();

      expect(vendorRepo.find).toHaveBeenCalledWith({
        where: { status: VendorStatus.APPROVED },
        order: { businessName: 'ASC' },
      });
    });

    it('maps each vendor to a VendorResponseDto with only public fields', async () => {
      const vendor = mockVendor({
        id: 'v1',
        businessName: 'Zulu Weaves',
        tradingName: 'Zulu Weaves',
        status: VendorStatus.APPROVED,
        countryCode: 'ZA',
      });
      vendorRepo.find.mockResolvedValue([vendor]);

      const result = await service.findDirectory();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'v1',
        businessName: 'Zulu Weaves',
        tradingName: 'Zulu Weaves',
        status: VendorStatus.APPROVED,
        countryCode: 'ZA',
      });
    });

    it('returns an empty array when no approved vendors exist', async () => {
      vendorRepo.find.mockResolvedValue([]);

      const result = await service.findDirectory();

      expect(result).toEqual([]);
      expect(vendorRepo.find).toHaveBeenCalledWith({
        where: { status: VendorStatus.APPROVED },
        order: { businessName: 'ASC' },
      });
    });
  });
});
