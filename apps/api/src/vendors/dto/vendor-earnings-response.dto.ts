import {
  EarningsBalanceDto,
  SettlementPeriodPreviewDto,
  VendorEarningsReportDto,
  VendorEarningsSummaryDto,
} from '@hb/shared';

export class VendorEarningsResponseDto implements VendorEarningsReportDto {
  from: string;
  to: string;
  summary: VendorEarningsSummaryDto;
  balance: EarningsBalanceDto;
  settlementPreview: SettlementPeriodPreviewDto[];
}
