import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategorySuggestion, SearchSuggestions, VendorStatus, VendorSuggestion } from '@hb/shared';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Category } from '../categories/entities/category.entity';
import { ProductSearchService } from './product-search.service';

const SUGGESTIONS_PER_GROUP = 5;

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    // The omnibox's `products` group is fed by the Meilisearch-backed engine
    // suggest (card #48/#50 landmine resolution) — one GET /search/suggest
    // route, no competing Postgres-vs-Meilisearch product suggest paths.
    private productSearchService: ProductSearchService,
  ) {}

  async suggest(q: string): Promise<SearchSuggestions> {
    const [products, vendors, categories] = await Promise.all([
      this.productSearchService
        .suggest(q)
        .then((results) => results.slice(0, SUGGESTIONS_PER_GROUP)),
      this.suggestVendors(q),
      this.suggestCategories(q),
    ]);

    return { products, vendors, categories };
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
