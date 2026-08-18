import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  CurrencyCode,
  ImageVariantSet,
  OrderStatus,
  UploadedImageDto,
  VendorStatus,
  UserRole,
} from '@hb/shared';
import { Vendor } from './entities/vendor.entity';
import { Product } from '../products/entities/product.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { AdminCreateVendorDto } from './dto/admin-create-vendor.dto';
import { VendorResponseDto } from './dto/vendor-response.dto';
import { AdminVendorResponseDto } from './dto/admin-vendor-response.dto';
import { VendorSelfResponseDto } from './dto/vendor-self-response.dto';
import { VendorDashboardResponseDto } from './dto/vendor-dashboard-response.dto';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { VendorEvents } from '../common/events/domain-events';
import { FileUrlService } from '../products/upload/file-url.service';
import { ImageProcessorService } from '../common/image-processing/image-processor.service';
import { ImageVariantWriterService } from '../common/image-processing/image-variant-writer.service';
import { VENDOR_LOGO_PRESETS, VENDOR_BANNER_PRESETS } from './upload/vendor-image.presets';

type BrandingAsset = 'logo' | 'banner';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    private usersService: UsersService,
    private auditService: AuditService,
    private eventEmitter: EventEmitter2,
    private fileUrlService: FileUrlService,
    private imageProcessor: ImageProcessorService,
    private imageVariantWriter: ImageVariantWriterService,
  ) {}

  // Builds the nested `UploadedImageDto` for `VendorDto.logo`/`banner` from a vendor's
  // flat width/height/sizeBytes/variants columns. Only present once an asset has been
  // processed through the image pipeline (PIO-5) — legacy vendors with only
  // `logoUrl`/`bannerUrl` set (no dimensions probed) resolve to `undefined` here, and
  // callers keep serving the bare URL, matching the products path's null-variants
  // fallback.
  private toUploadedImageDto(
    width?: number,
    height?: number,
    sizeBytes?: number,
    variants?: ImageVariantSet,
  ): UploadedImageDto | undefined {
    if (width == null || height == null || sizeBytes == null) {
      return undefined;
    }
    return { width, height, sizeBytes, variants: variants ?? {} };
  }

  private toResponseDto(vendor: Vendor): VendorResponseDto {
    return {
      id: vendor.id,
      businessName: vendor.businessName,
      tradingName: vendor.tradingName,
      status: vendor.status,
      countryCode: vendor.countryCode,
      logoUrl: vendor.logoUrl,
      logo: this.toUploadedImageDto(
        vendor.logoWidth,
        vendor.logoHeight,
        vendor.logoSizeBytes,
        vendor.logoVariants,
      ),
      bannerUrl: vendor.bannerUrl,
      banner: this.toUploadedImageDto(
        vendor.bannerWidth,
        vendor.bannerHeight,
        vendor.bannerSizeBytes,
        vendor.bannerVariants,
      ),
      slogan: vendor.slogan,
      profileSections: vendor.profileSections,
    };
  }

  private toAdminResponseDto(vendor: Vendor): AdminVendorResponseDto {
    return {
      ...this.toResponseDto(vendor),
      registrationNumber: vendor.registrationNumber,
      website: vendor.website,
      description: vendor.description,
      verificationDocumentUrl: vendor.verificationDocumentUrl,
      // createdAt is a CreateDateColumn — always set on a persisted vendor.
      appliedAt: vendor.createdAt.toISOString(),
    };
  }

  // Owner self-view — widens the public shape with the vendor's own editable
  // fields. Only ever called from the owner-gated GET /vendors/me route (and
  // from update(), so an owner PATCHing their own profile gets the same shape).
  private toSelfResponseDto(vendor: Vendor): VendorSelfResponseDto {
    return {
      ...this.toResponseDto(vendor),
      website: vendor.website,
      description: vendor.description,
      notificationEmail: vendor.notificationEmail ?? null,
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

  async updateStatus(
    id: string,
    newStatus: VendorStatus,
    actingUserId?: string,
  ): Promise<VendorResponseDto> {
    const vendor = await this.vendorRepository.findOne({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const allowed = VendorsService.STATUS_TRANSITIONS[vendor.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new ConflictException(
        `Cannot change vendor status from '${vendor.status}' to '${newStatus}'`,
      );
    }

    const previousStatus = vendor.status;
    vendor.status = newStatus;
    const updated = await this.vendorRepository.save(vendor);

    await this.auditService.log({
      userId: actingUserId ?? null,
      action: AuditAction.VENDOR_STATUS_CHANGED,
      entityType: 'vendor',
      entityId: id,
      metadata: { from: previousStatus, to: newStatus },
    });

    // Reconciles vendorStatus on every one of this vendor's indexed product
    // documents (query-time visibility filter reads this field live).
    this.eventEmitter.emit(VendorEvents.STATUS_CHANGED, { vendorId: id, status: newStatus });

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

  // Public vendor-profile lookup. Only APPROVED vendors are public-facing, matching
  // findDirectory visibility — a pending/rejected/suspended vendor must 404, not leak.
  async findOne(id: string): Promise<VendorResponseDto> {
    const vendor = await this.vendorRepository.findOne({
      where: { id, status: VendorStatus.APPROVED },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return this.toResponseDto(vendor);
  }

  // Only called from the owner-gated GET /vendors/me route — returns the widened
  // self-view (adds website/description on top of the public branding fields).
  async findByUserId(userId: string): Promise<VendorSelfResponseDto | null> {
    const vendor = await this.vendorRepository.findOne({ where: { userId } });
    return vendor ? this.toSelfResponseDto(vendor) : null;
  }

  // Resolves the address TE-4 should send this vendor's transactional-email
  // notifications to: the vendor-portal override wins when set, otherwise the
  // owning account's email. Admin-created vendors can have no linked user at
  // all (Vendor.userId is nullable — see vendor.entity.ts), so a vendor with
  // neither an override nor a user resolves to null ("no recipient") rather
  // than throwing — callers (TE-4) should skip-and-warn on null, not crash.
  async resolveNotificationEmail(vendorId: string): Promise<string | null> {
    const vendor = await this.vendorRepository.findOne({
      where: { id: vendorId },
      relations: ['user'],
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    return vendor.notificationEmail || vendor.user?.email || null;
  }

  // Structural + ownership validation for profileSections, run before persisting:
  //  - section ids must be unique within the payload
  //  - productIds within a single section must not repeat
  //  - every productId anywhere in the payload (not just on 'curated' sections —
  //    the DTO's own IsCuratedProductIds/IsCategoryId validators already make it
  //    structurally impossible for a non-curated section to carry productIds, but
  //    this loop deliberately doesn't re-derive that from `type` so it keeps
  //    working even if that invariant ever changes) must belong to the vendor
  //    row being edited (not the acting user's own vendor, in case an admin is
  //    editing someone else's profile). Ownership is checked with a single
  //    batched query, not N+1.
  private async validateProfileSections(
    vendorId: string,
    profileSections: UpdateVendorDto['profileSections'],
  ): Promise<void> {
    if (!profileSections?.length) return;

    const sectionIds = profileSections.map((section) => section.id);
    if (new Set(sectionIds).size !== sectionIds.length) {
      throw new BadRequestException('profileSections must not contain duplicate section ids');
    }

    const allProductIds: string[] = [];
    for (const section of profileSections) {
      const ids = section.productIds ?? [];
      if (!ids.length) continue;
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException(
          `Section '${section.id}' must not contain duplicate productIds`,
        );
      }
      allProductIds.push(...ids);
    }

    const productIds = [...new Set(allProductIds)];
    if (productIds.length === 0) return;

    const owned = await this.productRepository.find({
      where: { id: In(productIds), vendorId },
    });
    if (owned.length !== productIds.length) {
      throw new BadRequestException('One or more productIds do not belong to this vendor');
    }
  }

  async update(
    id: string,
    updateDto: UpdateVendorDto,
    currentUser: User,
  ): Promise<VendorSelfResponseDto> {
    const vendor = await this.vendorRepository.findOne({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    // Admins may edit any vendor (the controller allows @Roles(VENDOR, ADMIN));
    // everyone else may only edit their own profile (see docs/security L4).
    if (currentUser.role !== UserRole.ADMIN && vendor.userId !== currentUser.id) {
      throw new ForbiddenException('You can only update your own vendor profile');
    }

    await this.validateProfileSections(vendor.id, updateDto.profileSections);

    Object.assign(vendor, updateDto);
    const updated = await this.vendorRepository.save(vendor);
    // Return the self-view (not the lean public shape) — an owner PATCHing
    // website/description should see those fields echoed back, matching GET /vendors/me.
    return this.toSelfResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    const result = await this.vendorRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('Vendor not found');
  }

  async hasVendor(userId: string): Promise<boolean> {
    return !!(await this.vendorRepository.findOne({ where: { userId } }));
  }

  // Shared owner-scoped branding-image update: looks the vendor up by the acting
  // user's id (never a client-supplied vendor id — matches GET /vendors/me), runs the
  // upload through the same ImageProcessorService pipeline PIO-2 built for products
  // (logo/banner preset sets — vendor-image.presets.ts), writes the derivatives to
  // uploads/vendors, and persists the "full" derivative's URL as the canonical
  // logoUrl/bannerUrl plus the flat dimensions/variants columns. The raw upload is
  // never the file served — only WebP derivatives get written to disk.
  private async updateBrandingImage(
    userId: string,
    asset: BrandingAsset,
    file: Express.Multer.File,
  ): Promise<VendorSelfResponseDto> {
    const vendor = await this.vendorRepository.findOne({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const presets = asset === 'logo' ? VENDOR_LOGO_PRESETS : VENDOR_BANNER_PRESETS;
    const destDir = this.fileUrlService.getUploadDir('vendors');
    const keyStem = uuidv4();

    const processed = await this.imageProcessor.process(file.buffer, presets);
    const written = await this.imageVariantWriter.write(processed, destDir, keyStem);

    const full = written.find((w) => w.preset === 'full');
    if (!full) {
      // Every preset set above always includes a 'full' entry — this only trips if
      // vendor-image.presets.ts is ever misconfigured without one.
      throw new UnprocessableEntityException(
        `Image processing did not produce a "full" derivative for the vendor ${asset}.`,
      );
    }

    const variants: ImageVariantSet = {};
    for (const variant of written) {
      variants[variant.preset as keyof ImageVariantSet] = {
        url: this.fileUrlService.getFileUrl(variant.filename, 'vendors'),
        width: variant.width,
        height: variant.height,
        sizeBytes: variant.sizeBytes,
      };
    }

    const url = this.fileUrlService.getFileUrl(full.filename, 'vendors');
    if (asset === 'logo') {
      vendor.logoUrl = url;
      vendor.logoWidth = full.width;
      vendor.logoHeight = full.height;
      vendor.logoSizeBytes = full.sizeBytes;
      vendor.logoVariants = variants;
    } else {
      vendor.bannerUrl = url;
      vendor.bannerWidth = full.width;
      vendor.bannerHeight = full.height;
      vendor.bannerSizeBytes = full.sizeBytes;
      vendor.bannerVariants = variants;
    }

    const updated = await this.vendorRepository.save(vendor);
    return this.toSelfResponseDto(updated);
  }

  async updateLogo(userId: string, file: Express.Multer.File): Promise<VendorSelfResponseDto> {
    return this.updateBrandingImage(userId, 'logo', file);
  }

  async updateBanner(userId: string, file: Express.Multer.File): Promise<VendorSelfResponseDto> {
    return this.updateBrandingImage(userId, 'banner', file);
  }

  async getDashboard(userId: string): Promise<VendorDashboardResponseDto> {
    const vendor = await this.vendorRepository.findOne({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const vendorId = vendor.id;

    const productCount = await this.productRepository.count({ where: { vendorId } });

    const revenueRow = await this.orderItemRepository
      .createQueryBuilder('oi')
      .select('SUM(CAST(oi.unitPrice AS decimal) * oi.quantity)', 'totalRevenue')
      .where('oi.vendorId = :vendorId', { vendorId })
      .getRawOne<{ totalRevenue: string | null }>();

    const statusRows = await this.orderItemRepository
      .createQueryBuilder('oi')
      .leftJoin('oi.order', 'o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('oi.vendorId = :vendorId', { vendorId })
      .groupBy('o.status')
      .getRawMany<{ status: string; count: string }>();

    const orderCountByStatus: Partial<Record<OrderStatus, number>> = {};
    for (const row of statusRows) {
      orderCountByStatus[row.status as OrderStatus] = parseInt(row.count, 10);
    }

    return {
      productCount,
      orderCountByStatus,
      totalRevenue: parseFloat(revenueRow?.totalRevenue ?? '0') || 0,
      currency: CurrencyCode.ZAR,
    };
  }
}
