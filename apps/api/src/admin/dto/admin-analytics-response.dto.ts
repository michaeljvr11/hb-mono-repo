import {
  AdminAnalyticsSummaryDto,
  CurrencyTotalDto,
  FunnelStageCountDto,
  TimeSeriesPointDto,
} from '@hb/shared';

export class AdminAnalyticsResponseDto implements AdminAnalyticsSummaryDto {
  funnel: FunnelStageCountDto[];
  conversionRate: number;
  revenueByCurrency: CurrencyTotalDto[];
  timeSeries: TimeSeriesPointDto[];
}
