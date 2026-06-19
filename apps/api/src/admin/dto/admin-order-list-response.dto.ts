import { AdminOrderListDto, AdminOrderListItemDto } from '@hb/shared';

export class AdminOrderListResponseDto implements AdminOrderListDto {
  items: AdminOrderListItemDto[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}
