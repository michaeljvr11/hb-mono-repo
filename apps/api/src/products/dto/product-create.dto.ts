import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsArray,
  IsUUID,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Transform, Type, plainToInstance } from 'class-transformer';
import { CountryCode, CurrencyCode, ProductCreateRequest } from '@hb/shared';
import { ProductSizeInputDto } from './product-size-input.dto';

export class ProductCreateDto implements ProductCreateRequest {
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  description: string;

  @IsNumber({}, { message: 'Price must be a number' })
  @IsPositive({ message: 'Price must be greater than 0' })
  @Type(() => Number)
  price: number;

  @IsEnum(CurrencyCode)
  @IsOptional()
  currency?: CurrencyCode;

  @IsNumber({}, { message: 'Stock quantity must be a number' })
  @IsOptional()
  @Type(() => Number)
  stockQuantity?: number = 0;

  @IsEnum(CountryCode)
  @IsOptional()
  originCountry?: CountryCode;

  @IsOptional()
  @IsString()
  vendorId?: string; // set from auth context; override allowed for admin flows

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  @Type(() => String)
  categoryIds?: string[];

  // Multipart form submissions (product create with images) send every field
  // as a string — `sizes` arrives JSON-stringified (see the web
  // `ProductsService.toFormData()`). JSON-body requests (no images) already
  // deliver a real array and pass through this untouched.
  //
  // class-transformer applies @Type()'s nested-class conversion to the RAW
  // property value BEFORE running this @Transform (custom transforms run
  // last), so by the time this executor sees the value it's already too
  // late for @Type to turn a freshly-parsed array into ProductSizeInputDto
  // instances — @Type saw only the still-JSON string and left it alone.
  // We therefore instantiate each element ourselves via `plainToInstance`
  // so @ValidateNested below sees real class instances either way.
  // Malformed JSON, and non-array JSON, both fall through unchanged to
  // @IsArray() and fail validation cleanly (400), never a 500.
  @Transform(({ value }: { value: unknown }): unknown => {
    if (typeof value !== 'string') return value;
    let parsed: unknown;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return value;
    }
    if (!Array.isArray(parsed)) return parsed;
    return parsed.map((item) => plainToInstance(ProductSizeInputDto, item));
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSizeInputDto)
  sizes?: ProductSizeInputDto[];
}
