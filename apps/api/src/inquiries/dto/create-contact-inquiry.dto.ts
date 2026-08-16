import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateContactInquiryRequest, InquiryOrderType } from '@hb/shared';

/**
 * Unauthenticated write path (POST /inquiries is @Public) — every string
 * field carries a MaxLength so an anonymous caller can't use the free-text
 * fields (message especially) as a storage-abuse vector. Lengths match the
 * `contact_inquiries` column widths exactly (see the migration).
 */
export class CreateContactInquiryDto implements CreateContactInquiryRequest {
  @IsString({ message: 'name is required' })
  @MaxLength(200, { message: 'name must be 200 characters or fewer' })
  name: string;

  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255, { message: 'email must be 255 characters or fewer' })
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'phone must be 50 characters or fewer' })
  phone?: string;

  @IsEnum(InquiryOrderType, { message: 'orderType must be a recognised order type' })
  orderType: InquiryOrderType;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'referenceNumber must be 100 characters or fewer' })
  referenceNumber?: string;

  @IsString({ message: 'message is required' })
  @MaxLength(5000, { message: 'message must be 5000 characters or fewer' })
  message: string;
}
