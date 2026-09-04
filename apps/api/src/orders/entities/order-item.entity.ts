import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { CurrencyCode, ListingType } from '@hb/shared';
import { Order } from './order.entity';
import { Product } from '../../products/entities/product.entity';
import { ProductSize } from '../../products/entities/product-size.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';

/**
 * Order line with price/name snapshotted at purchase time — the product row
 * can change or disappear later. listingType + vendorId record which business
 * model fulfils this line (platform first-party vs marketplace vendor), so a
 * single order can mix both.
 */
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  orderId: string;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column({ nullable: true })
  productId?: string;

  @Column()
  productName: string; // snapshot

  /**
   * Selected size (Product Sizing), nullable/`ON DELETE SET NULL` — mirrors
   * the `product` FK above: a vendor renaming/deleting a size after the
   * order ships must never break the historical record. `sizeLabel` is the
   * actual snapshot (same style as `productName`); this FK is only a live
   * reference for as long as the size row survives.
   */
  @ManyToOne(() => ProductSize, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productSizeId' })
  productSize?: ProductSize;

  @Column({ type: 'uuid', nullable: true })
  productSizeId?: string;

  @Column({ nullable: true })
  sizeLabel?: string; // snapshot — absent for unsized lines

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number; // snapshot

  @Column({
    type: 'enum',
    enum: CurrencyCode,
    enumName: 'currency_code',
    default: CurrencyCode.ZAR,
  })
  currency: CurrencyCode;

  @Column({ type: 'int' })
  quantity: number;

  @Column({
    type: 'enum',
    enum: ListingType,
    enumName: 'listing_type',
    default: ListingType.VENDOR,
  })
  listingType: ListingType;

  @ManyToOne(() => Vendor, { nullable: true })
  @JoinColumn({ name: 'vendorId' })
  vendor?: Vendor;

  @Column({ nullable: true })
  vendorId?: string;

  /**
   * Commission rate (%) in force at order-creation time, snapshotted the same
   * way as `unitPrice`/`productName` — a later change to `commission_rates`
   * must never retroactively restate this line's earnings. `NULL` for
   * platform lines (`vendorId` unset) — there is no vendor to charge a fee to.
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  commissionRatePercent?: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
