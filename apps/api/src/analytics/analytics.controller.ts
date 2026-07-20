import { Body, Controller, Post } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CreateAnalyticsEventDto } from './dto/create-analytics-event.dto';
import { Public } from '../common/decorators/public.decorator';

/**
 * Bespoke analytics ingestion. Public — the funnel starts before login
 * (anonymous session) and events like payment_attempted fire from client
 * code with no guaranteed auth context. Thin: all logic lives in the service.
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Public()
  @Post('events')
  ingest(@Body() dto: CreateAnalyticsEventDto) {
    return this.analyticsService.ingest(dto);
  }
}
