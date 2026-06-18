import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
