import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import {
  AdminAnalyticsQuery,
  AdminAnalyticsSummaryDto,
  AnalyticsEventType,
  AnalyticsGranularity,
  CurrencyCode,
  CurrencyTotalDto,
  FunnelStageCountDto,
  OrderStatus,
  TimeSeriesPointDto,
} from '@hb/shared';
import { Order } from '../orders/entities/order.entity';
import { AnalyticsEvent } from '../analytics/entities/analytics-event.entity';
import { AdminAnalyticsResponseDto } from './dto/admin-analytics-response.dto';
import { analyticsBucketKey, resolveAnalyticsRange } from '../common/utils/analytics-range.utils';

/**
 * Aggregation rules (mirrors AP-10's `AdminOrdersService.getDashboard`):
 *   - Revenue = sum of (unitPrice * quantity) over non-cancelled order lines, grouped by
 *     currency. ZAR and NAD are kept as separate entries and never summed together.
 *   - Cancelled orders are excluded from both the orders count and revenue everywhere.
 *   - Amounts are rounded with `Math.round(x * 100) / 100`.
 *   - Aggregation happens in-memory after a range-filtered repository load — same
 *     established pattern as AP-10, acceptable at current volume.
 *   // ponytail: in-memory bucketing scans every order/item in range on each call — fine
 *   // at current volume; upgrade to DB-side GROUP BY (like the funnel query) if the
 *   // orders table grows large enough that admin analytics latency becomes visible.
 *
 * Range semantics:
 *   - `from`/`to` are inclusive calendar dates (UTC). Omitted `to` defaults to today;
 *     omitted `from` defaults to 29 days before `to` (30 days inclusive total).
 *   - The funnel is filtered by `analytics_events.occurredAt` — the client-clock
 *     behavioural timestamp — because funnel analysis cares about when the customer
 *     acted, not when the server received the event.
 *   - Orders/revenue are filtered by `order.createdAt` — the order's own timeline.
 *
 * Funnel semantics:
 *   - `sessions` per stage = COUNT(DISTINCT sessionId), not raw event counts — a
 *     session firing the same event twice still counts once.
 *   - All 7 AnalyticsEventType values are always present (zero-filled), in enum
 *     declaration order.
 *   - conversionRate = distinct ORDER_COMPLETED sessions / distinct PRODUCT_VIEWED
 *     sessions, rounded to 4 decimals; 0 when there were zero PRODUCT_VIEWED sessions
 *     (never NaN/Infinity).
 *
 * Bucketing:
 *   - day → the UTC calendar date.
 *   - week → the Monday (UTC) of that ISO week.
 *   - month → the 1st (UTC) of that month.
 *   - Buckets with no orders are omitted; the returned series is always sorted
 *     ascending by `date`.
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsEventRepo: Repository<AnalyticsEvent>,
  ) {}

  async getSummary(query: AdminAnalyticsQuery): Promise<AdminAnalyticsSummaryDto> {
    const { from, to } = resolveAnalyticsRange(query);
    const granularity: AnalyticsGranularity = query.granularity ?? 'day';

    const [funnel, sessionsByType] = await this.getFunnel(from, to);
    const conversionRate = this.computeConversionRate(sessionsByType);
    const { revenueByCurrency, timeSeries } = await this.getOrdersAndRevenue(from, to, granularity);

    const result = new AdminAnalyticsResponseDto();
    result.funnel = funnel;
    result.conversionRate = conversionRate;
    result.revenueByCurrency = revenueByCurrency;
    result.timeSeries = timeSeries;
    return result;
  }

  private async getFunnel(
    from: Date,
    to: Date,
  ): Promise<[FunnelStageCountDto[], Map<AnalyticsEventType, number>]> {
    const rows = await this.analyticsEventRepo
      .createQueryBuilder('e')
      .select('e.type', 'type')
      .addSelect('COUNT(DISTINCT e.sessionId)', 'sessions')
      .where('e.occurredAt BETWEEN :from AND :to', { from, to })
      .groupBy('e.type')
      .getRawMany<{ type: AnalyticsEventType; sessions: string }>();

    // Zero-fill every AnalyticsEventType, in enum declaration order.
    const sessionsByType = new Map<AnalyticsEventType, number>(
      Object.values(AnalyticsEventType).map((t) => [t, 0]),
    );
    for (const row of rows) {
      sessionsByType.set(row.type, parseInt(row.sessions, 10) || 0);
    }

    const funnel: FunnelStageCountDto[] = Array.from(sessionsByType.entries()).map(
      ([stage, sessions]) => ({ stage, sessions }),
    );

    return [funnel, sessionsByType];
  }

  private computeConversionRate(sessionsByType: Map<AnalyticsEventType, number>): number {
    const viewed = sessionsByType.get(AnalyticsEventType.PRODUCT_VIEWED) ?? 0;
    const completed = sessionsByType.get(AnalyticsEventType.ORDER_COMPLETED) ?? 0;
    if (viewed === 0) return 0;
    return Math.round((completed / viewed) * 10000) / 10000;
  }

  private async getOrdersAndRevenue(
    from: Date,
    to: Date,
    granularity: AnalyticsGranularity,
  ): Promise<{ revenueByCurrency: CurrencyTotalDto[]; timeSeries: TimeSeriesPointDto[] }> {
    const orders = await this.ordersRepo.find({
      where: { createdAt: Between(from, to) },
      relations: ['items'],
    });

    const totalRevenueMap = new Map<CurrencyCode, number>();
    const bucketMap = new Map<string, { orders: number; revenueMap: Map<CurrencyCode, number> }>();

    for (const order of orders) {
      // Cancelled orders contribute nothing — neither to the count nor to revenue.
      if (order.status === OrderStatus.CANCELLED) {
        continue;
      }

      const bucketDate = analyticsBucketKey(order.createdAt, granularity);
      let bucket = bucketMap.get(bucketDate);
      if (!bucket) {
        bucket = { orders: 0, revenueMap: new Map<CurrencyCode, number>() };
        bucketMap.set(bucketDate, bucket);
      }
      bucket.orders += 1;

      for (const item of order.items ?? []) {
        const lineTotal = Number(item.unitPrice) * item.quantity;
        bucket.revenueMap.set(
          item.currency,
          (bucket.revenueMap.get(item.currency) ?? 0) + lineTotal,
        );
        totalRevenueMap.set(item.currency, (totalRevenueMap.get(item.currency) ?? 0) + lineTotal);
      }
    }

    const timeSeries: TimeSeriesPointDto[] = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bucket]) => ({
        date,
        orders: bucket.orders,
        revenueByCurrency: this.toRevenueDtos(bucket.revenueMap),
      }));

    return {
      revenueByCurrency: this.toRevenueDtos(totalRevenueMap),
      timeSeries,
    };
  }

  private toRevenueDtos(map: Map<CurrencyCode, number>): CurrencyTotalDto[] {
    return Array.from(map.entries()).map(([currency, amount]) => ({
      currency,
      amount: Math.round(amount * 100) / 100,
    }));
  }
}
