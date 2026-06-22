import { AdminDashboardDto, CurrencyTotalDto, OrderStatusCountDto } from '@hb/shared';

export class AdminDashboardResponseDto implements AdminDashboardDto {
  pendingVendorCount: number;
  totalOrders: number;
  orderCountsByStatus: OrderStatusCountDto[];
  platformRevenue: CurrencyTotalDto[];
  vendorRevenue: CurrencyTotalDto[];
}
