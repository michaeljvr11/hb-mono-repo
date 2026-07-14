import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Brackets, In, Repository } from 'typeorm';
import { ListingType, ProductDto, ProductQuery, UserRole, VendorStatus } from '@hb/shared';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductCreateDto } from './dto/product-create.dto';
import { ProductUpdateDto } from './dto/product-update.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { ProductToResponseDto } from '../common/utils/mappers.utils';
import { FileUrlService } from './upload/file-url.service';
import { User } from '../users/entities/user.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Category } from '../categories/entities/category.entity';
import { AuditAction, AuditService } from '../audit/audit.service';
import { ProductEvents } from '../common/events/domain-events';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(ProductImage)
    private imageRepository: Repository<ProductImage>,
    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    private fileUrlService: FileUrlService,
    private auditService: AuditService,
    private eventEmitter: EventEmitter2,
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

    const product = this.productsRepository.create({
      ...createData,
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

    return this.productsRepository.save(product);
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

    const product = await this.create({
      ...createDto,
      vendorId,
      listingType,
    });

    if (!files?.length) {
      const created = await this.findOne(product.id);
      await this.auditService.log({
        userId: currentUser.id,
        action: AuditAction.PRODUCT_CREATED,
        entityType: 'product',
        entityId: product.id,
      });
      // Emitted last, once the product (and any relations) are fully
      // persisted — the search indexer refetches by id on receipt.
      this.eventEmitter.emit(ProductEvents.CREATED, { productId: product.id });
      return created;
    }

    if (files.length > 8) {
      throw new BadRequestException('Maximum 8 images allowed per product');
    }

    const imageDtos: CreateProductImageDto[] = files.map((file, index) => ({
      url: this.fileUrlService.getFileUrl(file.filename),
      key: file.filename,
      isPrimary: index === 0,
      displayOrder: index,
      altText: `${createDto.name} image ${index + 1}`,
    }));

    await this.addMultipleImages(product.id, imageDtos);

    const created = await this.findOne(product.id);
    await this.auditService.log({
      userId: currentUser.id,
      action: AuditAction.PRODUCT_CREATED,
      entityType: 'product',
      entityId: product.id,
    });
    // Emitted after images are attached so the indexed document has its
    // primary image on the very first upsert.
    this.eventEmitter.emit(ProductEvents.CREATED, { productId: product.id });
    return created;
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

  async findAll(query?: ProductQuery): Promise<ProductDto[]> {
    const qb = this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.categories', 'categories');

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

    const products = await qb.getMany();
    return products.map(ProductToResponseDto);
  }

  async findOne(id: string): Promise<ProductDto> {
    const product = await this.productsRepository.findOne({
      where: [
        { id, listingType: ListingType.PLATFORM },
        { id, listingType: ListingType.VENDOR, vendor: { status: VendorStatus.APPROVED } },
      ],
      relations: ['images', 'vendor', 'categories'],
    });
    if (!product) throw new NotFoundException('Product not found');
    return ProductToResponseDto(product);
  }

  async findOneFull(id: string): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { id },
      relations: ['images', 'vendor', 'categories'],
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
