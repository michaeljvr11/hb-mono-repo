import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { ProductSearchService } from './product-search.service';
import { SearchSuggestQueryDto } from './dto/search-suggest-query.dto';
import { ProductSearchQueryDto } from './dto/product-search-query.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('search')
export class SearchController {
  constructor(
    private searchService: SearchService,
    private productSearchService: ProductSearchService,
  ) {}

  // Faceted product search engine (card #48). New route, no collision with
  // the omnibox. @Public + no SSR-specific handling needed here (this is a
  // plain JSON API endpoint consumed by the SSR-safe /shop storefront page).
  @Public()
  @Get()
  search(@Query() query: ProductSearchQueryDto) {
    return this.productSearchService.search(query);
  }

  // Existing omnibox suggest route (unchanged path) — its `products` group is
  // now fed by the Meilisearch-backed engine (see SearchService.suggest).
  @Public()
  @Get('suggest')
  suggest(@Query() query: SearchSuggestQueryDto) {
    return this.searchService.suggest(query.q);
  }
}
