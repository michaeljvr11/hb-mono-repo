import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { meilisearchClientProvider } from './meilisearch.provider';
import { SearchHealthService } from './search-health.service';
import { SearchSettingsService } from './search-settings.service';
import { SearchIndexerService } from './search-indexer.service';
import { ProductSearchService } from './product-search.service';
import { SynonymsService } from './synonyms.service';
import { SynonymsController } from './synonyms.controller';
import { Product } from '../products/entities/product.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Category } from '../categories/entities/category.entity';
import { Synonym } from './entities/synonym.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Vendor, Category, Synonym])],
  controllers: [SearchController, SynonymsController],
  providers: [
    SearchService,
    meilisearchClientProvider,
    SearchHealthService,
    SearchSettingsService,
    SearchIndexerService,
    ProductSearchService,
    SynonymsService,
  ],
  exports: [SearchIndexerService, ProductSearchService, SynonymsService],
})
export class SearchModule {}
