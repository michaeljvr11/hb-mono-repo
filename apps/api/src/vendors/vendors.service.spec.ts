import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CurrencyCode, VendorStatus, UserRole, CountryCode } from '@hb/shared';
import { VendorsService } from './vendors.service';
import { AuditService } from '../audit/audit.service';
import { Vendor } from './entities/vendor.entity';
import { Product } from '../products/entities/product.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

const mockVendor = (overrides: Partial<Vendor> = {}): Vendor =>
  ({
    id: 'v1',
    businessName: 'Roots & Shoots Art',
    tradingName: 'Roots & Shoots',
    status: VendorStatus.APPROVED,
    countryCode: 'ZA',
    ...overrides,
  }) as Vendor;

const mockUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u1',
    role: UserRole.CUSTOMER,
    ...overrides,
  }) as User;

const makeQb = (overrides: Record<string, jest.Mock> = {}) => {
  const qb: Record<string, jest.Mock> = {
    select: jest.fn(),
    addSelect: jest.fn(),
    leftJoin: jest.fn(),
    where: jest.fn(),
    groupBy: jest.fn(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
    ...overrides,
  };
  // chain all methods back to the same qb
  Object.keys(qb).forEach((k) => {
    if (k !== 'getRawOne' && k !== 'getRawMany') {
      qb[k].mockReturnValue(qb);
    }
  });
  return qb;
};

describe('VendorsService', () => {
  let service: VendorsService;
  let vendorRepo: Record<string, jest.Mock>;
  let productRepo: Record<string, jest.Mock>;
  let orderItemRepo: Record<string, jest.Mock>;
  let usersService: { update: jest.Mock };
  let auditService: { log: jest.Mock; query: jest.Mock };

  beforeEach(async () => {
    vendorRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };

    productRepo = { count: jest.fn() };

    orderItemRepo = { createQueryBuilder: jest.fn() };

    usersService = { update: jest.fn() };

    auditService = { log: jest.fn().mockResolvedValue(undefined), query: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        VendorsService,
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepo },
        { provide: UsersService, useValue: usersService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(VendorsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('persists a vendor with status PENDING when the customer has no existing profile', async () => {
      const user = mockUser();
      const dto: CreateVendorDto = {
        businessName: 'Dune Crafts',
        countryCode: CountryCode.NAMIBIA,
      };

      vendorRepo.findOne.mockResolvedValue(null);
      vendorRepo.create.mockImplementation((data: Partial<Vendor>) => ({ ...data }));
      vendorRepo.save.mockImplementation((v: Partial<Vendor>) =>
        Promise.resolve({ id: 'v2', tradingName: null, ...v } as Vendor),
      );
      usersService.update.mockResolvedValue({});

      const result = await service.create(dto, user);

      expect(vendorRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: VendorStatus.PENDING }),
      );
      expect(result.status).toBe(VendorStatus.PENDING);
    });

    it('calls usersService.update with the vendor role when the applicant is a customer', async () => {
      const user = mockUser({ id: 'u1', role: UserRole.CUSTOMER });
      const dto: CreateVendorDto = {
        businessName: 'Dune Crafts',
        countryCode: CountryCode.NAMIBIA,
      };

      vendorRepo.findOne.mockResolvedValue(null);
      vendorRepo.create.mockImplementation((data: Partial<Vendor>) => ({ ...data }));
      vendorRepo.save.mockImplementation((v: Partial<Vendor>) =>
        Promise.resolve({ id: 'v2', tradingName: null, ...v } as Vendor),
      );
      usersService.update.mockResolvedValue({});

      await service.create(dto, user);

      expect(usersService.update).toHaveBeenCalledWith('u1', { role: UserRole.VENDOR });
    });

    it('throws ConflictException and does not save when the user already has a vendor profile', async () => {
      const user = mockUser();
      const dto: CreateVendorDto = {
        businessName: 'Dune Crafts',
        countryCode: CountryCode.NAMIBIA,
      };

      vendorRepo.findOne.mockResolvedValue(mockVendor({ userId: 'u1' }));

      await expect(service.create(dto, user)).rejects.toBeInstanceOf(ConflictException);
      expect(vendorRepo.save).not.toHaveBeenCalled();
      expect(usersService.update).not.toHaveBeenCalled();
    });
  });

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

  describe('getDashboard', () => {
    const vendor = mockVendor({ id: 'v1', userId: 'u1' });

    function setupDashboardMocks(
      revenueRaw: { totalRevenue: string | null } | null,
      statusRaw: { status: string; count: string }[],
    ) {
      vendorRepo.findOne.mockResolvedValue(vendor);
      productRepo.count.mockResolvedValue(5);

      const revenueQb = makeQb({ getRawOne: jest.fn().mockResolvedValue(revenueRaw) });
      const statusQb = makeQb({ getRawMany: jest.fn().mockResolvedValue(statusRaw) });
      orderItemRepo.createQueryBuilder.mockReturnValueOnce(revenueQb).mockReturnValueOnce(statusQb);
    }

    it('returns productCount from the product repository', async () => {
      setupDashboardMocks({ totalRevenue: '0' }, []);
      const result = await service.getDashboard('u1');
      expect(result.productCount).toBe(5);
    });

    it('parses totalRevenue from the decimal string returned by the query', async () => {
      setupDashboardMocks({ totalRevenue: '1500.50' }, []);
      const result = await service.getDashboard('u1');
      expect(result.totalRevenue).toBeCloseTo(1500.5);
    });

    it('returns 0 totalRevenue when no order items exist (null aggregate)', async () => {
      setupDashboardMocks(null, []);
      const result = await service.getDashboard('u1');
      expect(result.totalRevenue).toBe(0);
    });

    it('returns 0 totalRevenue when aggregate returns null totalRevenue field', async () => {
      setupDashboardMocks({ totalRevenue: null }, []);
      const result = await service.getDashboard('u1');
      expect(result.totalRevenue).toBe(0);
    });

    it('builds orderCountByStatus from the status group rows', async () => {
      setupDashboardMocks({ totalRevenue: '500.00' }, [
        { status: 'pending', count: '3' },
        { status: 'delivered', count: '7' },
      ]);
      const result = await service.getDashboard('u1');
      expect(result.orderCountByStatus).toEqual({ pending: 3, delivered: 7 });
    });

    it('returns ZAR as the currency', async () => {
      setupDashboardMocks({ totalRevenue: '0' }, []);
      const result = await service.getDashboard('u1');
      expect(result.currency).toBe(CurrencyCode.ZAR);
    });

    it('throws NotFoundException when the vendor profile does not exist', async () => {
      vendorRepo.findOne.mockResolvedValue(null);
      await expect(service.getDashboard('no-such-user')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
