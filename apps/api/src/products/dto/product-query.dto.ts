import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { ProductQuery } from '@hb/shared';

export class ProductQueryDto implements ProductQuery {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  q?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;
}
