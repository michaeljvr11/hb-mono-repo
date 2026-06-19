import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AdminDashboardDto,
  AdminOrderListDto,
  AdminOrderListItemDto,
  AdminOrderListQuery,
  CurrencyCode,
  ListingType,
  OrderStatus,
  VendorStatus,
} from '@hb/shared';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { AdminDashboardResponseDto } from './dto/admin-dashboard-response.dto';
import { AdminOrderListResponseDto } from './dto/admin-order-list-response.dto';

/**
 * Revenue aggregation rules:
 *   - Revenue = sum of (unitPrice * quantity) over all non-cancelled order lines.
 *   - Lines are split by listingType: PLATFORM → platformRevenue, VENDOR → vendorRevenue.
 *   - Results are grouped by currency — ZAR and NAD are kept as separate entries and
 *     never summed together (the 1:1 ZAR/NAD peg is data, never an assumption).
 *   - "Paid-only" revenue refinement (filter by payment status) is deferred until the
 *     payments module has a real implementation.
 *
 * vendorId filter for listOrders:
 *   - Orders are loaded with their items and user in-memory; filtering happens after load.
 *   - itemCount and vendorIds always reflect the whole order, not just the filtered vendor's lines.
 *   - NOTE: DB-level pagination is a follow-up once checkout/order volume lands; at skeleton
 *     stage the table is empty so in-memory pagination is acceptable and far simpler to test.
 */
@Injectable()
export class AdminOrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
  ) {}

  async listOrders(query: AdminOrderListQuery): Promise<AdminOrderListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Load all orders with items and user. No ownership filter — admin sees everything.
    let orders = await this.ordersRepo.find({
      relations: ['items', 'user'],
      order: { createdAt: 'DESC' },
    });

    // Apply status filter.
    if (query.status !== undefined) {
      orders = orders.filter((o) => o.status === query.status);
    }

    // Apply vendorId filter: keep orders that have at least one item with that vendorId.
    // itemCount/vendorIds still reflect the whole order (not pruned to matching lines).
    if (query.vendorId !== undefined) {
      const vid = query.vendorId;
      orders = orders.filter((o) => o.items.some((item) => item.vendorId === vid));
    }

    const total = orders.length;
    const pageCount = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const pageOrders = orders.slice(skip, skip + limit);

    const items: AdminOrderListItemDto[] = pageOrders.map((order) => {
      const vendorIds = [
        ...new Set(order.items.map((i) => i.vendorId).filter((v): v is string => v != null)),
      ];
      const customerName =
        order.user.firstName && order.user.lastName
          ? `${order.user.firstName} ${order.user.lastName}`
          : undefined;

      return {
        id: order.id,
        status: order.status,
        currency: order.currency,
        total: Number(order.total),
        customerId: order.userId,
        customerEmail: order.user.email,
        customerName,
        vendorIds,
        itemCount: order.items.length,
        originCountry: order.originCountry,
        destinationCountry: order.destinationCountry,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      };
    });

    const result = new AdminOrderListResponseDto();
    result.items = items;
    result.total = total;
    result.page = page;
    result.limit = limit;
    result.pageCount = pageCount;
    return result;
  }

  async getDashboard(): Promise<AdminDashboardDto> {
    const pendingVendorCount = await this.vendorRepo.count({
      where: { status: VendorStatus.PENDING },
    });

    const orders = await this.ordersRepo.find();
    const totalOrders = orders.length;

    // Zero-fill every OrderStatus value, then tally actual orders.
    const statusTally = new Map<OrderStatus, number>(Object.values(OrderStatus).map((s) => [s, 0]));
    for (const order of orders) {
      statusTally.set(order.status, (statusTally.get(order.status) ?? 0) + 1);
    }
    const orderCountsByStatus = Array.from(statusTally.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    // Load all order items with their parent order for revenue aggregation.
    const allItems = await this.orderItemRepo.find({ relations: ['order'] });

    const platformMap = new Map<CurrencyCode, number>();
    const vendorMap = new Map<CurrencyCode, number>();

    for (const item of allItems) {
      // Skip lines belonging to cancelled orders — they contribute no revenue.
      if (item.order.status === OrderStatus.CANCELLED) {
        continue;
      }

      const lineTotal = Number(item.unitPrice) * item.quantity;
      const currency = item.currency;

      if (item.listingType === ListingType.PLATFORM) {
        platformMap.set(currency, (platformMap.get(currency) ?? 0) + lineTotal);
      } else {
        vendorMap.set(currency, (vendorMap.get(currency) ?? 0) + lineTotal);
      }
    }

    const toRevenueDtos = (map: Map<CurrencyCode, number>) =>
      Array.from(map.entries()).map(([currency, amount]) => ({
        currency,
        amount: Math.round(amount * 100) / 100,
      }));

    const result = new AdminDashboardResponseDto();
    result.pendingVendorCount = pendingVendorCount;
    result.totalOrders = totalOrders;
    result.orderCountsByStatus = orderCountsByStatus;
    result.platformRevenue = toRevenueDtos(platformMap);
    result.vendorRevenue = toRevenueDtos(vendorMap);
    return result;
  }
}
