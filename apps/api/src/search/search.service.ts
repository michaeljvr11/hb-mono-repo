import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  CategorySuggestion,
  ListingType,
  ProductSuggestion,
  SearchSuggestions,
  VendorStatus,
  VendorSuggestion,
} from '@hb/shared';
import { Product } from '../products/entities/product.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Category } from '../categories/entities/category.entity';

const SUGGESTIONS_PER_GROUP = 5;

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
  ) {}

  async suggest(q: string): Promise<SearchSuggestions> {
    const [products, vendors, categories] = await Promise.all([
      this.suggestProducts(q),
      this.suggestVendors(q),
      this.suggestCategories(q),
    ]);

    return { products, vendors, categories };
  }

  private async suggestProducts(q: string): Promise<ProductSuggestion[]> {
    const products = await this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.vendor', 'vendor')
      // Approved-vendor visibility rule (card c2o6xfZs) — identical semantics to
      // ProductsService.findAll: platform listings always visible, vendor listings
      // only when the owning vendor is approved. Wrapped in Brackets so the OR is
      // grouped into a single AND-operand before ANDing with the name match below
      // (AND binds tighter than OR in SQL, so an unbracketed OR would let platform
      // listings bypass the name filter).
      .where(
        new Brackets((qb) => {
          qb.where('product.listingType = :platformType', {
            platformType: ListingType.PLATFORM,
          }).orWhere('product.listingType = :vendorType AND vendor.status = :approvedStatus', {
            vendorType: ListingType.VENDOR,
            approvedStatus: VendorStatus.APPROVED,
          });
        }),
      )
      .andWhere('product.name ILIKE :q', { q: `%${q}%` })
      .take(SUGGESTIONS_PER_GROUP)
      .getMany();

    return products.map((product): ProductSuggestion => {
      const primaryImage =
        product.images?.find((img) => img.isPrimary) ?? product.images?.[0] ?? null;

      return {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        currency: product.currency,
        imageUrl: primaryImage?.url ?? null,
        vendorName: product.vendor?.businessName ?? null,
      };
    });
  }

  private async suggestVendors(q: string): Promise<VendorSuggestion[]> {
    const vendors = await this.vendorRepository
      .createQueryBuilder('vendor')
      // Approved-only: a pending/rejected/suspended vendor must never appear.
      .where('vendor.status = :approvedStatus', { approvedStatus: VendorStatus.APPROVED })
      .andWhere('(vendor.businessName ILIKE :q OR vendor.tradingName ILIKE :q)', {
        q: `%${q}%`,
      })
      .take(SUGGESTIONS_PER_GROUP)
      .getMany();

    return vendors.map(
      (vendor): VendorSuggestion => ({
        id: vendor.id,
        businessName: vendor.businessName,
        countryCode: vendor.countryCode ?? null,
      }),
    );
  }

  private async suggestCategories(q: string): Promise<CategorySuggestion[]> {
    const categories = await this.categoryRepository
      .createQueryBuilder('category')
      .where('category.name ILIKE :q', { q: `%${q}%` })
      .take(SUGGESTIONS_PER_GROUP)
      .getMany();

    return categories.map(
      (category): CategorySuggestion => ({
        id: category.id,
        name: category.name,
        slug: category.slug ?? null,
      }),
    );
  }
}
