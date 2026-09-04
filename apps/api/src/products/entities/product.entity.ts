import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  JoinTable,
  ManyToMany,
  JoinColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';
import { CountryCode, CurrencyCode, ListingType } from '@hb/shared';
import { ProductImage } from './product-image.entity';
import { ProductSize } from './product-size.entity';
import { Category } from '../../categories/entities/category.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';

@Entity('products')
@Check(
  'CHK_products_listing_vendor',
  `("listingType" = 'vendor' AND "vendorId" IS NOT NULL) OR ("listingType" = 'platform' AND "vendorId" IS NULL)`,
)
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  name: string;

  @Column({ nullable: false })
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: false })
  price: number;

  @Column({
    type: 'enum',
    enum: CurrencyCode,
    enumName: 'currency_code',
    default: CurrencyCode.ZAR,
  })
  currency: CurrencyCode;

  @Column({ type: 'int', default: 0 })
  stockQuantity: number;

  /** Where the product ships from; drives the cross-border fulfilment path. */
  @Column({
    type: 'enum',
    enum: CountryCode,
    enumName: 'country_code',
    default: CountryCode.SOUTH_AFRICA,
  })
  originCountry: CountryCode;

  /**
   * platform = first-party listing fulfilled by HB (no vendor row),
   * vendor = marketplace listing owned by a vendor.
   * Invariant (enforced in service + DB check): vendor listings must have vendorId.
   */
  @Column({
    type: 'enum',
    enum: ListingType,
    enumName: 'listing_type',
    default: ListingType.VENDOR,
  })
  listingType: ListingType;

  @OneToMany(() => ProductImage, (image) => image.product, {
    cascade: true,
    eager: true,
  })
  images: ProductImage[];

  @ManyToOne(() => Vendor, (vendor) => vendor.products, { nullable: true })
  @JoinColumn({ name: 'vendorId' })
  vendor?: Vendor;

  @Column({ nullable: true })
  vendorId?: string;

  @ManyToMany(() => Category, (category) => category.products, { cascade: true })
  @JoinTable({
    name: 'product_categories',
    joinColumn: { name: 'productId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
  })
  categories: Category[];

  /**
   * Opt-in per-size stock list (Product Sizing). Zero rows ⇒ unsized product,
   * unchanged legacy behaviour driven by `stockQuantity` above. Not `eager` —
   * loaded explicitly alongside `images`/`vendor`/`categories` wherever those
   * are, matching the existing (non-eager) relation-loading style for
   * `vendor`/`categories` rather than `images`.
   */
  @OneToMany(() => ProductSize, (size) => size.product, { cascade: true })
  sizes?: ProductSize[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
