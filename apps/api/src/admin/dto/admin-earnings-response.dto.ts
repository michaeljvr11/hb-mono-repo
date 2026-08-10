import { AdminEarningsReportDto, CurrencyTotalDto, VendorEarningsSummaryDto } from '@hb/shared';

export class AdminEarningsResponseDto implements AdminEarningsReportDto {
  from: string;
  to: string;
  vendors: VendorEarningsSummaryDto[];
  platformCommissionByCurrency: CurrencyTotalDto[];
  platformListingGmvByCurrency: CurrencyTotalDto[];
  heldForVendorsByCurrency: CurrencyTotalDto[];
}
