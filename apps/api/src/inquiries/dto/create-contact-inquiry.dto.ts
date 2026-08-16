import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CreateContactInquiryRequest, InquiryOrderType } from '@hb/shared';

/** Whitespace-only input is not input. Trimming before validation is what makes
 * IsNotEmpty below mean "has content" rather than "has characters" — without it
 * a `"   "` name satisfies every validator and lands in the table. */
const trimmed = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Unauthenticated write path (POST /inquiries is @Public) — every string
 * field carries a MaxLength so an anonymous caller can't use the free-text
 * fields (message especially) as a storage-abuse vector. Lengths match the
 * `contact_inquiries` column widths exactly (see the migration).
 *
 * The web form enforces `required` too, but nothing stops a direct POST, so
 * emptiness is rejected here rather than trusted from the client — a blank
 * lead is both a junk row and an email to ops.
 */
export class CreateContactInquiryDto implements CreateContactInquiryRequest {
  @trimmed()
  @IsString({ message: 'name is required' })
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(200, { message: 'name must be 200 characters or fewer' })
  name: string;

  @trimmed()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255, { message: 'email must be 255 characters or fewer' })
  email: string;

  @trimmed()
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'phone must be 50 characters or fewer' })
  phone?: string;

  @IsEnum(InquiryOrderType, { message: 'orderType must be a recognised order type' })
  orderType: InquiryOrderType;

  @trimmed()
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'referenceNumber must be 100 characters or fewer' })
  referenceNumber?: string;

  @trimmed()
  @IsString({ message: 'message is required' })
  @IsNotEmpty({ message: 'message is required' })
  @MaxLength(5000, { message: 'message must be 5000 characters or fewer' })
  message: string;
}
