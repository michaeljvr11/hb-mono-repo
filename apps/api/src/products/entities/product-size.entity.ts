import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from './product.entity';

/**
 * Opt-in per-product size row with its own stock count (Product Sizing spec).
 * A size belongs to exactly one product (cascade delete). Labels are free-text,
 * per-product (no shared taxonomy) and must be unique within a product —
 * enforced in ProductsService, mirroring the categoryIds existence check
 * (a cross-row check, not a per-field decorator).
 */
@Entity('product_sizes')
export class ProductSize {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, (product) => product.sizes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column({ nullable: false })
  label: string;

  @Column({ type: 'int' })
  stockQuantity: number;

  /** Vendor-controlled render order (PDP, cart, order lines) — never auto-sorted. */
  @Column({ type: 'int', default: 0 })
  displayOrder: number;
}
