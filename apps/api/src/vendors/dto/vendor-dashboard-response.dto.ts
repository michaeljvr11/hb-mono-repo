import { CurrencyCode, OrderStatus, VendorDashboardDto } from '@hb/shared';

export class VendorDashboardResponseDto implements VendorDashboardDto {
  productCount: number;
  orderCountByStatus: Partial<Record<OrderStatus, number>>;
  totalRevenue: number;
  currency: CurrencyCode;
}
