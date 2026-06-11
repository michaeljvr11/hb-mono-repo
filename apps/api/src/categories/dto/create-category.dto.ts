import { IsString, IsNotEmpty, IsOptional, IsNumber, IsUUID } from 'class-validator';
import { CreateCategoryRequest } from '@hb/shared';

export class CreateCategoryDto implements CreateCategoryRequest {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  slug?: string; // auto-generated from name when empty

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  displayOrder = 0;

  @IsUUID()
  @IsOptional()
  parentId?: string;
}
