import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { In } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CurrencyCode,
  VendorStatus,
  UserRole,
  CountryCode,
  VendorProfileSection,
  VendorSectionType,
} from '@hb/shared';
import { VendorsService } from './vendors.service';
import { AuditService } from '../audit/audit.service';
import { Vendor } from './entities/vendor.entity';
import { Product } from '../products/entities/product.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { FileUrlService } from '../products/upload/file-url.service';

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
  let eventEmitter: { emit: jest.Mock };
  let fileUrlService: { getFileUrl: jest.Mock };

  beforeEach(async () => {
    vendorRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };

    productRepo = { count: jest.fn(), find: jest.fn() };

    orderItemRepo = { createQueryBuilder: jest.fn() };

    usersService = { update: jest.fn() };

    auditService = { log: jest.fn().mockResolvedValue(undefined), query: jest.fn() };

    eventEmitter = { emit: jest.fn() };

    fileUrlService = { getFileUrl: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        VendorsService,
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepo },
        { provide: UsersService, useValue: usersService },
        { provide: AuditService, useValue: auditService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: FileUrlService, useValue: fileUrlService },
      ],
    }).compile();

    service = module.get(VendorsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('update (ownership)', () => {
    it('lets an admin update any vendor profile', async () => {
      const admin = mockUser({ id: 'admin1', role: UserRole.ADMIN });
      vendorRepo.findOne.mockResolvedValue(mockVendor({ id: 'v1', userId: 'someone-else' }));
      vendorRepo.save.mockImplementation((v: Vendor) => Promise.resolve(v));

      const result = await service.update('v1', { businessName: 'Renamed' }, admin);

      expect(vendorRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ businessName: 'Renamed' }),
      );
      expect(result.id).toBe('v1');
    });

    it('forbids a non-owner, non-admin from updating a vendor profile', async () => {
      const other = mockUser({ id: 'u2', role: UserRole.VENDOR });
      vendorRepo.findOne.mockResolvedValue(mockVendor({ id: 'v1', userId: 'u1' }));

      await expect(service.update('v1', { businessName: 'x' }, other)).rejects.toThrow(
        ForbiddenException,
      );
      expect(vendorRepo.save).not.toHaveBeenCalled();
    });

    it('lets the owner update their own vendor profile', async () => {
      const owner = mockUser({ id: 'u1', role: UserRole.VENDOR });
      vendorRepo.findOne.mockResolvedValue(mockVendor({ id: 'v1', userId: 'u1' }));
      vendorRepo.save.mockImplementation((v: Vendor) => Promise.resolve(v));

      const result = await service.update('v1', { businessName: 'Mine' }, owner);

      expect(result.id).toBe('v1');
    });

    it('returns the self-view shape (website/description) so an owner PATCH echoes what GET /vendors/me returns', async () => {
      const owner = mockUser({ id: 'u1', role: UserRole.VENDOR });
      vendorRepo.findOne.mockResolvedValue(
        mockVendor({ id: 'v1', userId: 'u1', website: 'https://old.example' }),
      );
      vendorRepo.save.mockImplementation((v: Vendor) => Promise.resolve(v));

      const result = await service.update(
        'v1',
        { website: 'https://new.example', description: 'Updated bio' },
        owner,
      );

      expect(result).toMatchObject({
        website: 'https://new.example',
        description: 'Updated bio',
      });
    });

    it('forbids a non-owner, non-admin vendor from setting another vendor’s notificationEmail', async () => {
      const other = mockUser({ id: 'u2', role: UserRole.VENDOR });
      vendorRepo.findOne.mockResolvedValue(mockVendor({ id: 'v1', userId: 'u1' }));

      await expect(
        service.update('v1', { notificationEmail: 'hijack@example.com' }, other),
      ).rejects.toThrow(ForbiddenException);
      expect(vendorRepo.save).not.toHaveBeenCalled();
    });

    it('persists the owner’s own notificationEmail override and echoes it in the self-view', async () => {
      const owner = mockUser({ id: 'u1', role: UserRole.VENDOR });
      vendorRepo.findOne.mockResolvedValue(mockVendor({ id: 'v1', userId: 'u1' }));
      vendorRepo.save.mockImplementation((v: Vendor) => Promise.resolve(v));

      const result = await service.update(
        'v1',
        { notificationEmail: 'orders@roots-and-shoots.example' },
        owner,
      );

      expect(vendorRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ notificationEmail: 'orders@roots-and-shoots.example' }),
      );
      expect(result.notificationEmail).toBe('orders@roots-and-shoots.example');
    });
  });

  describe('update (profile sections)', () => {
    const curatedSection = (productIds: string[], id = 's1'): VendorProfileSection => ({
      id,
      title: 'Bestsellers',
      type: VendorSectionType.CURATED,
      productIds,
    });

    const categorySection = (categoryId: string, id = 's2'): VendorProfileSection => ({
      id,
      title: 'Home & Living',
      type: VendorSectionType.CATEGORY,
      categoryId,
    });

    it('persists a mix of curated and category sections when all curated productIds belong to the vendor', async () => {
      const owner = mockUser({ id: 'u1', role: UserRole.VENDOR });
      vendorRepo.findOne.mockResolvedValue(mockVendor({ id: 'v1', userId: 'u1' }));
      vendorRepo.save.mockImplementation((v: Vendor) => Promise.resolve(v));
      productRepo.find.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);

      const sections = [curatedSection(['p1', 'p2']), categorySection('cat-1')];
      const result = await service.update('v1', { profileSections: sections }, owner);

      expect(productRepo.find).toHaveBeenCalledWith({
        where: { id: In(['p1', 'p2']), vendorId: 'v1' },
      });
      expect(vendorRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ profileSections: sections }),
      );
      expect(result.profileSections).toEqual(sections);
    });

    it('rejects when a curated section references a productId belonging to a different vendor', async () => {
      const owner = mockUser({ id: 'u1', role: UserRole.VENDOR });
      vendorRepo.findOne.mockResolvedValue(mockVendor({ id: 'v1', userId: 'u1' }));
      // Only p1 comes back — p2 belongs to some other vendor and is excluded by the
      // vendorId-scoped query.
      productRepo.find.mockResolvedValue([{ id: 'p1' }]);

      const sections = [curatedSection(['p1', 'p2'])];

      await expect(
        service.update('v1', { profileSections: sections }, owner),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(vendorRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a category-typed section carrying productIds that belong to another vendor (defense in depth — the DTO should already block this shape, but the service loop must not key off `type`)', async () => {
      const owner = mockUser({ id: 'u1', role: UserRole.VENDOR });
      vendorRepo.findOne.mockResolvedValue(mockVendor({ id: 'v1', userId: 'u1' }));
      // Nothing comes back — 'foreign-product' does not belong to vendor v1.
      productRepo.find.mockResolvedValue([]);

      const rogueSection = {
        id: 's1',
        title: 'Sneaky',
        type: VendorSectionType.CATEGORY,
        categoryId: 'cat-1',
        // Bypasses the DTO layer entirely — this test exercises the service's own
        // iterate-every-section guard, not class-validator.
        productIds: ['foreign-product'],
      } as unknown as VendorProfileSection;

      await expect(
        service.update('v1', { profileSections: [rogueSection] }, owner),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(productRepo.find).toHaveBeenCalledWith({
        where: { id: In(['foreign-product']), vendorId: 'v1' },
      });
      expect(vendorRepo.save).not.toHaveBeenCalled();
    });

    it('skips the ownership query entirely for category-only sections (no productIds to check)', async () => {
      const owner = mockUser({ id: 'u1', role: UserRole.VENDOR });
      vendorRepo.findOne.mockResolvedValue(mockVendor({ id: 'v1', userId: 'u1' }));
      vendorRepo.save.mockImplementation((v: Vendor) => Promise.resolve(v));

      const sections = [categorySection('cat-1')];
      await service.update('v1', { profileSections: sections }, owner);

      expect(productRepo.find).not.toHaveBeenCalled();
      expect(vendorRepo.save).toHaveBeenCalled();
    });

    it('rejects duplicate section ids in a single payload', async () => {
      const owner = mockUser({ id: 'u1', role: UserRole.VENDOR });
      vendorRepo.findOne.mockResolvedValue(mockVendor({ id: 'v1', userId: 'u1' }));

      const sections = [categorySection('cat-1', 'dup'), categorySection('cat-2', 'dup')];

      await expect(
        service.update('v1', { profileSections: sections }, owner),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(productRepo.find).not.toHaveBeenCalled();
      expect(vendorRepo.save).not.toHaveBeenCalled();
    });

    it('rejects duplicate productIds within a single curated section', async () => {
      const owner = mockUser({ id: 'u1', role: UserRole.VENDOR });
      vendorRepo.findOne.mockResolvedValue(mockVendor({ id: 'v1', userId: 'u1' }));

      const sections = [curatedSection(['p1', 'p1'])];

      await expect(
        service.update('v1', { profileSections: sections }, owner),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(productRepo.find).not.toHaveBeenCalled();
      expect(vendorRepo.save).not.toHaveBeenCalled();
    });

    it('lets an admin attach a curated section to another vendor profile when the productIds belong to THAT vendor (not the admin)', async () => {
      const admin = mockUser({ id: 'admin1', role: UserRole.ADMIN });
      vendorRepo.findOne.mockResolvedValue(mockVendor({ id: 'v1', userId: 'someone-else' }));
      vendorRepo.save.mockImplementation((v: Vendor) => Promise.resolve(v));
      productRepo.find.mockResolvedValue([{ id: 'p1' }]);

      const sections = [curatedSection(['p1'])];
      const result = await service.update('v1', { profileSections: sections }, admin);

      // Ownership is scoped to the vendor row being edited (v1), never the acting
      // admin's own vendor (admins typically have none).
      expect(productRepo.find).toHaveBeenCalledWith({
        where: { id: In(['p1']), vendorId: 'v1' },
      });
      expect(result.profileSections).toEqual(sections);
    });
  });

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

      const result = await service.updateStatus('v1', to, 'admin-1');

      expect(vendorRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'v1', status: to }),
      );
      expect(result.status).toBe(to);
      // Every status change writes an audit-trail entry (card AC: "approve vendor → entry").
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'vendor.status_changed',
          entityType: 'vendor',
          entityId: 'v1',
          metadata: { from, to },
        }),
      );
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

  describe('findOne (public vendor profile)', () => {
    // Mirror the repository's filtering: only return the stored vendor when EVERY
    // condition in the `where` clause matches — so the approved-only filter is exercised
    // exactly as Postgres would apply it (a non-approved vendor is excluded by the query
    // itself, not just by a hand-stubbed null).
    const respectsWhere =
      (stored: Vendor) =>
      ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          Object.entries(where).every(([k, v]) => stored[k as keyof Vendor] === v) ? stored : null,
        );

    it('returns an approved vendor mapped to the public VendorResponseDto', async () => {
      const vendor = mockVendor({
        id: 'v1',
        businessName: 'Zulu Weaves',
        tradingName: 'Zulu Weaves',
        status: VendorStatus.APPROVED,
        countryCode: 'ZA',
      });
      vendorRepo.findOne.mockImplementation(respectsWhere(vendor));

      const result = await service.findOne('v1');

      // Approved-only filter applied at the query layer, matching findDirectory visibility.
      expect(vendorRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'v1', status: VendorStatus.APPROVED },
      });
      expect(result).toEqual({
        id: 'v1',
        businessName: 'Zulu Weaves',
        tradingName: 'Zulu Weaves',
        status: VendorStatus.APPROVED,
        countryCode: 'ZA',
      });
    });

    it('omits admin-only PII fields (registrationNumber, verificationDocumentUrl)', async () => {
      const vendor = mockVendor({
        id: 'v1',
        status: VendorStatus.APPROVED,
        registrationNumber: 'ZA/2024/001',
        verificationDocumentUrl: 'https://cdn.hb.com/docs/za2024001.pdf',
        website: 'https://zulu-weaves.example',
        description: 'Handwoven goods',
      });
      vendorRepo.findOne.mockImplementation(respectsWhere(vendor));

      const result = await service.findOne('v1');

      expect(result).not.toHaveProperty('registrationNumber');
      expect(result).not.toHaveProperty('verificationDocumentUrl');
      expect(Object.keys(result).sort()).toEqual(
        [
          'bannerUrl',
          'businessName',
          'countryCode',
          'id',
          'logoUrl',
          'profileSections',
          'slogan',
          'status',
          'tradingName',
        ].sort(),
      );
    });

    it('never leaks notificationEmail on the public vendor payload, even when it is set', async () => {
      const vendor = mockVendor({
        id: 'v1',
        status: VendorStatus.APPROVED,
        notificationEmail: 'orders@zulu-weaves.example',
      });
      vendorRepo.findOne.mockImplementation(respectsWhere(vendor));

      const result = await service.findOne('v1');

      expect(result).not.toHaveProperty('notificationEmail');
    });

    // Only approved vendors are public-facing; every other status must 404, never leak.
    const nonApproved: VendorStatus[] = [
      VendorStatus.PENDING,
      VendorStatus.REJECTED,
      VendorStatus.SUSPENDED,
    ];

    it.each(nonApproved)('throws NotFoundException for a %s vendor', async (status) => {
      const vendor = mockVendor({ id: 'v1', status });
      vendorRepo.findOne.mockImplementation(respectsWhere(vendor));

      await expect(service.findOne('v1')).rejects.toBeInstanceOf(NotFoundException);
      expect(vendorRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'v1', status: VendorStatus.APPROVED },
      });
    });

    it('throws NotFoundException when no vendor has that id', async () => {
      vendorRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findByUserId (owner self-view)', () => {
    it('returns the widened self-view shape including website and description', async () => {
      const vendor = mockVendor({
        id: 'v1',
        userId: 'u1',
        website: 'https://roots-and-shoots.example',
        description: 'Handmade art from the Cape',
        slogan: 'Made by hand, made with heart',
        logoUrl: 'https://cdn.hb.com/logos/v1.png',
        bannerUrl: 'https://cdn.hb.com/banners/v1.png',
        profileSections: [{ id: 's1', title: 'Featured', type: 'curated', productIds: ['p1'] }],
      });
      vendorRepo.findOne.mockResolvedValue(vendor);

      const result = await service.findByUserId('u1');

      expect(vendorRepo.findOne).toHaveBeenCalledWith({ where: { userId: 'u1' } });
      expect(result).toMatchObject({
        id: 'v1',
        website: 'https://roots-and-shoots.example',
        description: 'Handmade art from the Cape',
        slogan: 'Made by hand, made with heart',
        logoUrl: 'https://cdn.hb.com/logos/v1.png',
        bannerUrl: 'https://cdn.hb.com/banners/v1.png',
        profileSections: [{ id: 's1', title: 'Featured', type: 'curated', productIds: ['p1'] }],
      });
    });

    it('returns null when the user has no vendor profile', async () => {
      vendorRepo.findOne.mockResolvedValue(null);

      const result = await service.findByUserId('no-vendor-user');

      expect(result).toBeNull();
    });
  });

  describe('resolveNotificationEmail (TE-4 recipient resolution)', () => {
    it('prefers the notificationEmail override over the account email', async () => {
      vendorRepo.findOne.mockResolvedValue(
        mockVendor({
          id: 'v1',
          notificationEmail: 'orders@roots-and-shoots.example',
          user: { email: 'owner@example.com' } as User,
        }),
      );

      const result = await service.resolveNotificationEmail('v1');

      expect(vendorRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'v1' },
        relations: ['user'],
      });
      expect(result).toBe('orders@roots-and-shoots.example');
    });

    it('falls back to the account email when notificationEmail is null', async () => {
      vendorRepo.findOne.mockResolvedValue(
        mockVendor({
          id: 'v1',
          notificationEmail: null,
          user: { email: 'owner@example.com' } as User,
        }),
      );

      const result = await service.resolveNotificationEmail('v1');

      expect(result).toBe('owner@example.com');
    });

    it('falls back to the account email when notificationEmail is undefined', async () => {
      vendorRepo.findOne.mockResolvedValue(
        mockVendor({ id: 'v1', user: { email: 'owner@example.com' } as User }),
      );

      const result = await service.resolveNotificationEmail('v1');

      expect(result).toBe('owner@example.com');
    });

    it('resolves to null (no recipient) without throwing for a userless, admin-created vendor', async () => {
      vendorRepo.findOne.mockResolvedValue(
        mockVendor({ id: 'v1', userId: undefined, user: undefined, notificationEmail: undefined }),
      );

      const result = await service.resolveNotificationEmail('v1');

      expect(result).toBeNull();
    });

    it('throws NotFoundException when the vendor does not exist', async () => {
      vendorRepo.findOne.mockResolvedValue(null);

      await expect(service.resolveNotificationEmail('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
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

  describe('updateLogo / updateBanner (owner-scoped branding upload)', () => {
    const file = { filename: 'abc123.png' } as Express.Multer.File;

    it('sets logoUrl from the uploaded file and returns the full self-view DTO shape', async () => {
      vendorRepo.findOne.mockResolvedValue(
        mockVendor({
          id: 'v1',
          userId: 'u1',
          bannerUrl: 'https://cdn.hb.com/banners/existing.png',
          website: 'https://roots-and-shoots.example',
          description: 'Handmade art from the Cape',
        }),
      );
      vendorRepo.save.mockImplementation((v: Vendor) => Promise.resolve(v));
      fileUrlService.getFileUrl.mockReturnValue('/uploads/vendors/abc123.png');

      const result = await service.updateLogo('u1', file);

      expect(vendorRepo.findOne).toHaveBeenCalledWith({ where: { userId: 'u1' } });
      expect(fileUrlService.getFileUrl).toHaveBeenCalledWith('abc123.png', 'vendors');
      expect(vendorRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ logoUrl: '/uploads/vendors/abc123.png' }),
      );
      // The banner field must be left untouched by a logo upload.
      expect(vendorRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ bannerUrl: 'https://cdn.hb.com/banners/existing.png' }),
      );
      // Full self-view shape (matches GET /vendors/me), not just the touched field.
      expect(result).toMatchObject({
        id: 'v1',
        logoUrl: '/uploads/vendors/abc123.png',
        bannerUrl: 'https://cdn.hb.com/banners/existing.png',
        website: 'https://roots-and-shoots.example',
        description: 'Handmade art from the Cape',
      });
    });

    it('sets bannerUrl from the uploaded file and leaves logoUrl untouched', async () => {
      vendorRepo.findOne.mockResolvedValue(
        mockVendor({
          id: 'v1',
          userId: 'u1',
          logoUrl: 'https://cdn.hb.com/logos/existing.png',
        }),
      );
      vendorRepo.save.mockImplementation((v: Vendor) => Promise.resolve(v));
      fileUrlService.getFileUrl.mockReturnValue('/uploads/vendors/abc123.png');

      const result = await service.updateBanner('u1', file);

      expect(fileUrlService.getFileUrl).toHaveBeenCalledWith('abc123.png', 'vendors');
      expect(vendorRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ bannerUrl: '/uploads/vendors/abc123.png' }),
      );
      // The logo field must be left untouched by a banner upload.
      expect(vendorRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ logoUrl: 'https://cdn.hb.com/logos/existing.png' }),
      );
      expect(result.bannerUrl).toBe('/uploads/vendors/abc123.png');
      expect(result.logoUrl).toBe('https://cdn.hb.com/logos/existing.png');
    });

    it('throws NotFoundException when the acting user has no vendor profile', async () => {
      vendorRepo.findOne.mockResolvedValue(null);

      await expect(service.updateLogo('no-vendor-user', file)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(vendorRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException from updateBanner too when the acting user has no vendor profile', async () => {
      vendorRepo.findOne.mockResolvedValue(null);

      await expect(service.updateBanner('no-vendor-user', file)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(vendorRepo.save).not.toHaveBeenCalled();
    });

    // Owner-scope: the lookup is keyed ONLY by the acting user's id (from the JWT via
    // @GetUser()), never by any client-supplied vendor/user id. Prove this isn't just
    // "404 on a missing row" by keying two distinct vendor profiles by two distinct
    // userIds and confirming each upload only ever reaches its own owner's row.
    it('scopes the lookup strictly to the requesting user — never touches another user’s vendor row', async () => {
      const vendorA = mockVendor({ id: 'vA', userId: 'user-a', logoUrl: 'old-a.png' });
      const vendorB = mockVendor({ id: 'vB', userId: 'user-b', logoUrl: 'old-b.png' });
      vendorRepo.findOne.mockImplementation(({ where }: { where: { userId: string } }) =>
        Promise.resolve([vendorA, vendorB].find((v) => v.userId === where.userId) ?? null),
      );
      vendorRepo.save.mockImplementation((v: Vendor) => Promise.resolve(v));
      fileUrlService.getFileUrl.mockReturnValue('/uploads/vendors/new-for-a.png');

      const result = await service.updateLogo('user-a', file);

      // Only vendor A's row was saved, with vendor A's id — user-b's row is untouched.
      expect(vendorRepo.save).toHaveBeenCalledTimes(1);
      expect(vendorRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'vA', userId: 'user-a' }),
      );
      expect(result.id).toBe('vA');
      expect(vendorB.logoUrl).toBe('old-b.png');
    });
  });
});
