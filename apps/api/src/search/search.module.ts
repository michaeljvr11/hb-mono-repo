import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { meilisearchClientProvider } from './meilisearch.provider';
import { SearchHealthService } from './search-health.service';
import { SearchSettingsService } from './search-settings.service';
import { SearchIndexerService } from './search-indexer.service';
import { ProductSearchService } from './product-search.service';
import { Product } from '../products/entities/product.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Category } from '../categories/entities/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Vendor, Category])],
  controllers: [SearchController],
  providers: [
    SearchService,
    meilisearchClientProvider,
    SearchHealthService,
    SearchSettingsService,
    SearchIndexerService,
    ProductSearchService,
  ],
  exports: [SearchIndexerService, ProductSearchService],
})
export class SearchModule {}
