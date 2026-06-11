export interface CartItemDto {
  id: string;
  productId: string;
  quantity: number;
}

export interface CartDto {
  id: string;
  items: CartItemDto[];
  updatedAt: string;
}
