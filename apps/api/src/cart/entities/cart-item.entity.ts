import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Cart } from './cart.entity';
import { Product } from '../../products/entities/product.entity';
import { ProductSize } from '../../products/entities/product-size.entity';

@Entity('cart_items')
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cartId' })
  cart: Cart;

  @Column()
  cartId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: string;

  /**
   * Selected size for a sized product (Product Sizing) — null for unsized
   * lines. `onDelete: 'SET NULL'`: a cart line for a since-deleted size
   * clamps to the unsized path (Product.stockQuantity) on the next
   * add/update rather than hard-failing — it never blocks the line outright.
   * Together with `productId`, this pair is the cart line's identity: two
   * different sizes of the same product are always distinct lines.
   */
  @ManyToOne(() => ProductSize, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productSizeId' })
  productSize?: ProductSize;

  @Column({ type: 'uuid', nullable: true })
  productSizeId?: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
