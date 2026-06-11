import { IsEnum, IsIn } from 'class-validator';
import { VendorStatus } from '@hb/shared';

export class UpdateVendorStatusDto {
  @IsEnum(VendorStatus)
  @IsIn([VendorStatus.APPROVED, VendorStatus.REJECTED, VendorStatus.SUSPENDED])
  status: VendorStatus;
}
