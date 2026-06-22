import { AuditLogDto, AuditLogListDto } from '@hb/shared';

export class AuditLogListResponseDto implements AuditLogListDto {
  items: AuditLogDto[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}
