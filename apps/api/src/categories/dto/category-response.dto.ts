import { CategoryDto } from '@hb/shared';

export class CategoryResponseDto implements CategoryDto {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  displayOrder: number;
  parentId?: string;
}
