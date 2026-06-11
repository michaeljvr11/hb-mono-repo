import { IsString, IsOptional, IsNumber, IsUUID } from 'class-validator';
import { UpdateCategoryRequest } from '@hb/shared';

export class UpdateCategoryDto implements UpdateCategoryRequest {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  displayOrder?: number;

  @IsUUID()
  @IsOptional()
  parentId?: string;
}
