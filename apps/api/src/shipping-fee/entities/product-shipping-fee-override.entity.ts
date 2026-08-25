import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CountryCode, CurrencyCode } from '@hb/shared';
import { Product } from '../../products/entities/product.entity';

/**
 * Per-product shipping fee override (SF-5) — deliberately **mutable, not
 * effective-dated** (mirrors `products.price`, unlike the append-only global
 * `ShippingFee`). The value actually charged is frozen onto
 * `orders.shippingTotal` at order-creation time (SF-3), so historical order
 * integrity never depends on this row's history — there is none, the current
 * row IS the value.
 *
 * Keyed on (productId, originCountry, destinationCountry, currency) — same
 * route+currency shape as the global default, but an override does NOT need
 * to cover all 4 routes x 2 currencies: a missing combination simply falls
 * back to `ShippingFeeService.getFeeAt`. Never let an override for one route
 * or currency leak into resolution for another.
 */
@Entity('product_shipping_fee_overrides')
@Index(['productId', 'originCountry', 'destinationCountry', 'currency'], { unique: true })
export class ProductShippingFeeOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column({ type: 'enum', enum: CountryCode, enumName: 'country_code' })
  originCountry: CountryCode;

  @Column({ type: 'enum', enum: CountryCode, enumName: 'country_code' })
  destinationCountry: CountryCode;

  @Column({ type: 'enum', enum: CurrencyCode, enumName: 'currency_code' })
  currency: CurrencyCode;

  /** The flat fee, in `currency`.
   *  NOTE: numeric columns come back as strings from the pg driver — always
   *  coerce with Number(...) at the service boundary before returning a DTO. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  /** The admin user who last set this override, if known. */
  @Column({ type: 'uuid', nullable: true })
  updatedByUserId: string | null;
}
