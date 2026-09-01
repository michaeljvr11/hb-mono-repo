import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Brackets, In, Repository } from 'typeorm';
import { unlink } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import {
  ImageVariantSet,
  ListingType,
  PagedResponse,
  ProductDto,
  ProductQuery,
  ProductSort,
  UserRole,
  VendorStatus,
} from '@hb/shared';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductSize } from './entities/product-size.entity';
import { ProductCreateDto } from './dto/product-create.dto';
import { ProductSizeInputDto } from './dto/product-size-input.dto';
import { ProductUpdateDto } from './dto/product-update.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { PRODUCT_IMAGE_PRESETS } from './upload/product-image.presets';
import { ProductToResponseDto } from '../common/utils/mappers.utils';
import { FileUrlService } from './upload/file-url.service';
import { User } from '../users/entities/user.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Category } from '../categories/entities/category.entity';
import { AuditAction, AuditService } from '../audit/audit.service';
import { ProductEvents } from '../common/events/domain-events';
import { ImageProcessorService } from '../common/image-processing/image-processor.service';
import { ImageVariantWriterService } from '../common/image-processing/image-variant-writer.service';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
const DEFAULT_PAGE = 1;

/** Primary sort column + direction per ProductSort value. `product.id` tiebreaker is always appended. */
const SORT_MAP: Record<ProductSort, { column: string; direction: 'ASC' | 'DESC' }> = {
  newest: { column: 'product.createdAt', direction: 'DESC' },
  price_asc: { column: 'product.price', direction: 'ASC' },
  price_desc: { column: 'product.price', direction: 'DESC' },
  name: { column: 'product.name', direction: 'ASC' },
};

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(ProductImage)
    private imageRepository: Repository<ProductImage>,
    @InjectRepository(ProductSize)
    private sizeRepository: Repository<ProductSize>,
    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    private fileUrlService: FileUrlService,
    private auditService: AuditService,
    private eventEmitter: EventEmitter2,
    private imageProcessor: ImageProcessorService,
    private imageVariantWriter: ImageVariantWriterService,
  ) {}

  async create(
    createData: ProductCreateDto & { vendorId?: string; listingType?: ListingType },
  ): Promise<Product> {
    const listingType = createData.listingType ?? ListingType.VENDOR;

    // Invariant: marketplace listings must belong to a vendor;
    // platform (first-party) listings must not.
    if (listingType === ListingType.VENDOR && !createData.vendorId) {
      throw new BadRequestException('vendorId is required for vendor listings');
    }
    if (listingType === ListingType.PLATFORM && createData.vendorId) {
      throw new BadRequestException('Platform listings cannot have a vendor');
    }

    const { sizes, ...rest } = createData;

    // Validate before any write — a duplicate-label 400 must leave no partial product row.
    if (sizes?.length) {
      this.assertUniqueSizeLabels(sizes);
    }

    const product = this.productsRepository.create({
      ...rest,
      listingType,
      stockQuantity: createData.stockQuantity ?? 0,
    });

    if (createData.categoryIds?.length) {
      const categories = await this.categoryRepository.findBy({
        id: In(createData.categoryIds),
      });

      if (categories.length !== createData.categoryIds.length) {
        throw new BadRequestException('One or more category IDs are invalid');
      }

      product.categories = categories;
    }

    const saved = await this.productsRepository.save(product);

    // Opt-in: only set sizes when the caller actually supplied a non-empty list.
    if (sizes?.length) {
      await this.replaceSizes(saved.id, sizes);
    }

    return saved;
  }

  /** Cross-row check — mirrors the categoryIds existence check: not expressible as a per-field decorator. */
  private assertUniqueSizeLabels(sizes: ProductSizeInputDto[]): void {
    const seen = new Set<string>();
    for (const size of sizes) {
      const label = size.label.trim();
      if (seen.has(label)) {
        throw new BadRequestException(`Duplicate size label: "${label}"`);
      }
      seen.add(label);
    }
  }

  // ponytail: replaceSizes runs as two separate statements outside the product
  // save() call, not one DB transaction with the rest of create()/update() — a
  // mid-request failure after this resolves but before the product save could
  // leave sizes replaced with stale product fields. Upgrade trigger: wrap
  // create()/update() in a queryRunner transaction if that interleaving is
  // ever observed (or once a second entity needs the same guarantee).
  /** Whole-list replace for a product's sizes — mirrors the categoryIds update pattern. */
  private async replaceSizes(productId: string, sizes: ProductSizeInputDto[]): Promise<void> {
    await this.sizeRepository.delete({ productId });

    if (!sizes.length) return;

    const entities = sizes.map((size, index) =>
      this.sizeRepository.create({
        productId,
        label: size.label.trim(),
        stockQuantity: size.stockQuantity,
        displayOrder: size.displayOrder ?? index,
      }),
    );

    await this.sizeRepository.save(entities);
  }

  /**
   * Full product creation including images.
   * Admins create platform (first-party) listings; vendors create their own.
   */
  async createWithImages(
    createDto: ProductCreateDto,
    files: Express.Multer.File[],
    currentUser: User,
  ): Promise<ProductDto> {
    if (files.length > 8) {
      throw new BadRequestException('Maximum 8 images allowed per product');
    }

    let vendorId: string | undefined;
    let listingType: ListingType;

    if (currentUser.role === UserRole.ADMIN) {
      listingType = ListingType.PLATFORM;
    } else {
      const vendor = await this.vendorRepository.findOne({
        where: { userId: currentUser.id },
      });

      if (!vendor) {
        throw new ForbiddenException(
          'You must complete your vendor profile before creating products.',
        );
      }

      vendorId = vendor.id;
      listingType = ListingType.VENDOR;
    }

    // Compensation scope for this whole request: every derivative written to disk (across
    // processing, however far it got) is tracked here so it can be best-effort unlinked if
    // *anything* downstream fails — processing itself, product creation (e.g. an invalid
    // categoryId), or attaching the image rows. Invariant this guarantees: a failed
    // `POST /products` leaves no product row, no image rows, and no files on disk.
    const writtenPaths: string[] = [];
    let product: Product | undefined;

    try {
      const imageDtos = files.length
        ? await this.processProductImages(files, createDto.name, writtenPaths)
        : [];

      product = await this.create({
        ...createDto,
        vendorId,
        listingType,
      });

      if (imageDtos.length) {
        await this.addMultipleImages(product.id, imageDtos);
      }
    } catch (err) {
      await Promise.all(writtenPaths.map((path) => unlink(path).catch(() => undefined)));
      if (product) {
        // Cascades to any image rows already inserted for this product
        // (ProductImage.product has onDelete: 'CASCADE').
        await this.productsRepository.delete(product.id).catch(() => undefined);
      }
      throw err;
    }

    const created = await this.findOne(product.id);
    await this.auditService.log({
      userId: currentUser.id,
      action: AuditAction.PRODUCT_CREATED,
      entityType: 'product',
      entityId: product.id,
    });
    // Emitted after images are attached (when present) so the indexed document has its
    // primary image on the very first upsert.
    this.eventEmitter.emit(ProductEvents.CREATED, { productId: product.id });
    return created;
  }

  /**
   * Resizes/re-encodes every uploaded file into its thumbnail/card/full WebP derivative
   * set (`ImageProcessorService`) and writes them to `uploads/products`
   * (`ImageVariantWriterService`) — locked decision: the raw original never touches disk
   * and is never the served file. `key` is the uuid stem shared by every derivative of one
   * upload (`<key>-thumbnail.webp`, `<key>-card.webp`, `<key>-full.webp`).
   *
   * Every derivative path written is appended to the caller-supplied `writtenPaths`
   * (mutated in place) as it's written, not just on success — `createWithImages` owns the
   * single compensation block that unlinks them if processing, product creation, or image
   * attachment fails anywhere in the same request.
   */
  private async processProductImages(
    files: Express.Multer.File[],
    productName: string,
    writtenPaths: string[],
  ): Promise<CreateProductImageDto[]> {
    const destDir = this.fileUrlService.getUploadDir();
    const dtos: CreateProductImageDto[] = [];

    for (const [index, file] of files.entries()) {
      const keyStem = uuidv4();
      const processed = await this.imageProcessor.process(file.buffer, PRODUCT_IMAGE_PRESETS);
      const written = await this.imageVariantWriter.write(processed, destDir, keyStem);
      writtenPaths.push(...written.map((w) => w.path));

      const full = written.find((w) => w.preset === 'full');
      if (!full) {
        // Every PRODUCT_IMAGE_PRESETS entry always yields a derivative — this only trips
        // if the preset set itself is ever misconfigured without a 'full' entry.
        throw new UnprocessableEntityException(
          'Image processing did not produce a "full" derivative.',
        );
      }

      const variants: ImageVariantSet = {};
      for (const variant of written) {
        variants[variant.preset as keyof ImageVariantSet] = {
          url: this.fileUrlService.getFileUrl(variant.filename),
          width: variant.width,
          height: variant.height,
          sizeBytes: variant.sizeBytes,
        };
      }

      dtos.push({
        url: this.fileUrlService.getFileUrl(full.filename),
        key: keyStem,
        isPrimary: index === 0,
        displayOrder: index,
        altText: `${productName} image ${index + 1}`,
        width: full.width,
        height: full.height,
        sizeBytes: full.sizeBytes,
        variants,
      });
    }

    return dtos;
  }

  async addMultipleImages(
    productId: string,
    images: CreateProductImageDto[],
  ): Promise<ProductImage[]> {
    const product = await this.productsRepository.findOne({
      where: { id: productId },
      relations: ['images', 'vendor', 'categories'],
    });

    if (!product) throw new NotFoundException('Product not found');

    const entities = images.map((dto) =>
      this.imageRepository.create({
        ...dto,
        product,
        productId,
      }),
    );

    return this.imageRepository.save(entities);
  }

  async findAll(query?: ProductQuery): Promise<PagedResponse<ProductDto>> {
    const qb = this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.categories', 'categories')
      .leftJoinAndSelect('product.sizes', 'sizes');

    // Approved-vendor visibility (card c2o6xfZs): platform listings are always
    // visible; vendor listings only when the owning vendor is approved. Every
    // other predicate below ANDs onto this — never overwrite or bypass it.
    // Wrapped in Brackets so the OR is grouped into a single AND-operand;
    // otherwise Postgres operator precedence (AND binds tighter than OR) lets
    // platform listings bypass every filter below.
    qb.where(
      new Brackets((qb) => {
        qb.where('product.listingType = :platformType', {
          platformType: ListingType.PLATFORM,
        }).orWhere('product.listingType = :vendorType AND vendor.status = :approvedStatus', {
          vendorType: ListingType.VENDOR,
          approvedStatus: VendorStatus.APPROVED,
        });
      }),
    );

    if (query?.categoryId) {
      // Unknown categoryId legitimately yields no matches — not an error.
      qb.andWhere(
        'product.id IN (SELECT pc."productId" FROM product_categories pc WHERE pc."categoryId" = :categoryId)',
        { categoryId: query.categoryId },
      );
    }

    if (query?.q) {
      qb.andWhere('(product.name ILIKE :q OR product.description ILIKE :q)', {
        q: `%${query.q}%`,
      });
    }

    if (query?.vendorId) {
      qb.andWhere('product.vendorId = :vendorId', { vendorId: query.vendorId });
    }

    const limit = Math.min(Math.max(query?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const page = Math.max(query?.page ?? DEFAULT_PAGE, 1);
    const skip = (page - 1) * limit;

    const { column, direction } = SORT_MAP[query?.sort ?? 'newest'];
    qb.orderBy(column, direction).addOrderBy('product.id', direction);

    qb.skip(skip).take(limit);

    const [products, total] = await qb.getManyAndCount();
    return { items: products.map(ProductToResponseDto), total, page, limit };
  }

  async findOne(id: string): Promise<ProductDto> {
    const product = await this.productsRepository.findOne({
      where: [
        { id, listingType: ListingType.PLATFORM },
        { id, listingType: ListingType.VENDOR, vendor: { status: VendorStatus.APPROVED } },
      ],
      relations: ['images', 'vendor', 'categories', 'sizes'],
    });
    if (!product) throw new NotFoundException('Product not found');
    return ProductToResponseDto(product);
  }

  async findOneFull(id: string): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { id },
      relations: ['images', 'vendor', 'categories', 'sizes'],
    });

    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(
    productId: string,
    updateDto: ProductUpdateDto,
    currentUser: User,
  ): Promise<ProductDto> {
    const product = await this.productsRepository.findOne({
      where: { id: productId },
      relations: ['vendor', 'categories'],
    });

    if (!product) throw new NotFoundException('Product not found');
    this.ensureCanManageProduct(product, currentUser);

    Object.assign(product, {
      name: updateDto.name ?? product.name,
      description: updateDto.description ?? product.description,
      price: updateDto.price ?? product.price,
      currency: updateDto.currency ?? product.currency,
      originCountry: updateDto.originCountry ?? product.originCountry,
      stockQuantity: updateDto.stockQuantity ?? product.stockQuantity,
    });

    if (updateDto.categoryIds !== undefined) {
      if (updateDto.categoryIds.length === 0) {
        product.categories = [];
      } else {
        const categories = await this.categoryRepository.findBy({
          id: In(updateDto.categoryIds),
        });

        if (categories.length !== updateDto.categoryIds.length) {
          throw new BadRequestException('One or more category IDs are invalid');
        }

        product.categories = categories;
      }
    }

    // Whole-list replace, exactly mirroring categoryIds above: present (even
    // []) replaces the full size set — [] makes the product unsized; absent
    // (undefined) leaves existing sizes untouched.
    if (updateDto.sizes !== undefined) {
      if (updateDto.sizes.length > 0) {
        this.assertUniqueSizeLabels(updateDto.sizes);
      }
      await this.replaceSizes(productId, updateDto.sizes);
    }

    const updated = await this.productsRepository.save(product);
    await this.auditService.log({
      userId: currentUser.id,
      action: AuditAction.PRODUCT_UPDATED,
      entityType: 'product',
      entityId: productId,
    });
    this.eventEmitter.emit(ProductEvents.UPDATED, { productId: updated.id });
    return this.findOne(updated.id);
  }

  async remove(id: string, currentUser: User): Promise<void> {
    const product = await this.productsRepository.findOne({
      where: { id },
      relations: ['vendor'],
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    this.ensureCanManageProduct(product, currentUser);

    const result = await this.productsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Product not found');
    }

    await this.auditService.log({
      userId: currentUser.id,
      action: AuditAction.PRODUCT_DELETED,
      entityType: 'product',
      entityId: id,
    });
    this.eventEmitter.emit(ProductEvents.DELETED, { productId: id });
  }

  private ensureCanManageProduct(product: Product, currentUser: User): void {
    if (currentUser.role === UserRole.ADMIN) {
      return;
    }

    if (product.vendor?.userId !== currentUser.id) {
      throw new ForbiddenException('You can only manage your own products');
    }
  }
}
