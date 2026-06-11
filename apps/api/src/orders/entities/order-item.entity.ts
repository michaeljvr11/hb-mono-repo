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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
