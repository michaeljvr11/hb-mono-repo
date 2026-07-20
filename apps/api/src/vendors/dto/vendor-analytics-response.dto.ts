import {
  CurrencyTotalDto,
  FunnelStageCountDto,
  TimeSeriesPointDto,
  VendorAnalyticsDto,
} from '@hb/shared';

export class VendorAnalyticsResponseDto implements VendorAnalyticsDto {
  funnel: FunnelStageCountDto[];
  orderCount: number;
  revenueByCurrency: CurrencyTotalDto[];
  timeSeries: TimeSeriesPointDto[];
}
