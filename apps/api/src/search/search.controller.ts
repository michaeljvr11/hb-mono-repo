import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchSuggestQueryDto } from './dto/search-suggest-query.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Public()
  @Get('suggest')
  suggest(@Query() query: SearchSuggestQueryDto) {
    return this.searchService.suggest(query.q);
  }
}
