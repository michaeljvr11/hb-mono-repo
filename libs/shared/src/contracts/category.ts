export interface CategoryDto {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  displayOrder: number;
  parentId?: string;
}

export interface CreateCategoryRequest {
  name: string;
  slug?: string;
  description?: string;
  displayOrder?: number;
  parentId?: string;
}

export type UpdateCategoryRequest = Partial<CreateCategoryRequest>;
