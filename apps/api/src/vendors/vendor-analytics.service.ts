import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AnalyticsEventType,
  AnalyticsGranularity,
  CurrencyCode,
  CurrencyTotalDto,
  FunnelStageCountDto,
  OrderStatus,
  TimeSeriesPointDto,
  VendorAnalyticsQuery,
} from '@hb/shared';
import { Vendor } from './entities/vendor.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { AnalyticsEvent } from '../analytics/entities/analytics-event.entity';
import { VendorAnalyticsResponseDto } from './dto/vendor-analytics-response.dto';
import { analyticsBucketKey, resolveAnalyticsRange } from '../common/utils/analytics-range.utils';

/**
 * Vendor-scoped mirror of `AdminAnalyticsService` (Analytics 4), with STRICT
 * tenant isolation:
 *   - The vendor is always resolved from the authenticated userId here in the
 *     service layer (VP-2 pattern, see `VendorsService.getDashboard`) — a
 *     client-supplied vendorId is never accepted, and every downstream query
 *     is filtered by that resolved id.
 *   - Funnel: `analytics_events.vendorId` is only populated on
 *     PRODUCT_VIEWED/ADD_TO_CART (see `@hb/shared` contracts/analytics.ts) —
 *     the other 5 stages are always zero for a vendor-scoped funnel today.
 *     All 7 AnalyticsEventType values are still present, zero-filled.
 *   - Orders/revenue: `order_items.vendorId` scopes both `orderCount`
 *     (distinct orders containing >= 1 of this vendor's lines) and revenue
 *     (gross line GMV of this vendor's own lines only — never
 *     net-of-commission, out of scope for this slice). Cancelled orders are
 *     excluded from both everywhere, mirroring AP-10/Analytics 4.
 *   - Range/bucketing rules (30-day default, day/week/month buckets) are
 *     shared with `AdminAnalyticsService` via `common/utils/analytics-range.utils`.
 */
@Injectable()
export class VendorAnalyticsService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepository: Repository<Vendor>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsEventRepository: Repository<AnalyticsEvent>,
  ) {}

  async getAnalytics(
    userId: string,
    query: VendorAnalyticsQuery,
  ): Promise<VendorAnalyticsResponseDto> {
    const vendor = await this.vendorRepository.findOne({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const vendorId = vendor.id;
    const { from, to } = resolveAnalyticsRange(query);
    const granularity: AnalyticsGranularity = query.granularity ?? 'day';

    const funnel = await this.getFunnel(vendorId, from, to);
    const { orderCount, revenueByCurrency, timeSeries } = await this.getOrdersAndRevenue(
      vendorId,
      from,
      to,
      granularity,
    );

    const result = new VendorAnalyticsResponseDto();
    result.funnel = funnel;
    result.orderCount = orderCount;
    result.revenueByCurrency = revenueByCurrency;
    result.timeSeries = timeSeries;
    return result;
  }

  private async getFunnel(vendorId: string, from: Date, to: Date): Promise<FunnelStageCountDto[]> {
    const rows = await this.analyticsEventRepository
      .createQueryBuilder('e')
      .select('e.type', 'type')
      .addSelect('COUNT(DISTINCT e.sessionId)', 'sessions')
      .where('e.vendorId = :vendorId', { vendorId })
      .andWhere('e.occurredAt BETWEEN :from AND :to', { from, to })
      .groupBy('e.type')
      .getRawMany<{ type: AnalyticsEventType; sessions: string }>();

    // Zero-fill every AnalyticsEventType, in enum declaration order — most stay 0 for a
    // vendor-scoped funnel since only PRODUCT_VIEWED/ADD_TO_CART carry a vendorId.
    const sessionsByType = new Map<AnalyticsEventType, number>(
      Object.values(AnalyticsEventType).map((t) => [t, 0]),
    );
    for (const row of rows) {
      sessionsByType.set(row.type, parseInt(row.sessions, 10) || 0);
    }

    return Array.from(sessionsByType.entries()).map(([stage, sessions]) => ({ stage, sessions }));
  }

  private async getOrdersAndRevenue(
    vendorId: string,
    from: Date,
    to: Date,
    granularity: AnalyticsGranularity,
  ): Promise<{
    orderCount: number;
    revenueByCurrency: CurrencyTotalDto[];
    timeSeries: TimeSeriesPointDto[];
  }> {
    const items = await this.orderItemRepository
      .createQueryBuilder('oi')
      .leftJoinAndSelect('oi.order', 'o')
      .where('oi.vendorId = :vendorId', { vendorId })
      .andWhere('o.createdAt BETWEEN :from AND :to', { from, to })
      .getMany();

    const totalRevenueMap = new Map<CurrencyCode, number>();
    const bucketMap = new Map<
      string,
      { orderIds: Set<string>; revenueMap: Map<CurrencyCode, number> }
    >();
    const allOrderIds = new Set<string>();

    for (const item of items) {
      const order = item.order;
      // Cancelled orders contribute nothing — neither to the count nor to revenue.
      if (!order || order.status === OrderStatus.CANCELLED) {
        continue;
      }

      allOrderIds.add(item.orderId);

      const lineTotal = Number(item.unitPrice) * item.quantity;
      totalRevenueMap.set(item.currency, (totalRevenueMap.get(item.currency) ?? 0) + lineTotal);

      const bucketDate = analyticsBucketKey(order.createdAt, granularity);
      let bucket = bucketMap.get(bucketDate);
      if (!bucket) {
        bucket = { orderIds: new Set<string>(), revenueMap: new Map<CurrencyCode, number>() };
        bucketMap.set(bucketDate, bucket);
      }
      bucket.orderIds.add(item.orderId);
      bucket.revenueMap.set(item.currency, (bucket.revenueMap.get(item.currency) ?? 0) + lineTotal);
    }

    const timeSeries: TimeSeriesPointDto[] = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bucket]) => ({
        date,
        orders: bucket.orderIds.size,
        revenueByCurrency: this.toRevenueDtos(bucket.revenueMap),
      }));

    return {
      orderCount: allOrderIds.size,
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
