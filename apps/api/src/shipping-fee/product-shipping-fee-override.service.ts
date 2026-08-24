import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CountryCode, CurrencyCode, ProductShippingFeeOverrideDto } from '@hb/shared';

import { ProductShippingFeeOverride } from './entities/product-shipping-fee-override.entity';
import { SetProductShippingFeeOverrideDto } from './dto/set-product-shipping-fee-override.dto';
import { ClearProductShippingFeeOverrideDto } from './dto/clear-product-shipping-fee-override.dto';
import { Product } from '../products/entities/product.entity';
import { AuditAction, AuditService } from '../audit/audit.service';

function toDto(row: ProductShippingFeeOverride): ProductShippingFeeOverrideDto {
  return {
    id: row.id,
    productId: row.productId,
    originCountry: row.originCountry,
    destinationCountry: row.destinationCountry,
    currency: row.currency,
    // numeric columns come back as strings from the pg driver — always coerce.
    amount: Number(row.amount),
    updatedAt: row.updatedAt.toISOString(),
    updatedByUserId: row.updatedByUserId ?? undefined,
  };
}

/**
 * Per-product shipping fee override (SF-5). A dedicated service (not folded
 * into `ProductsService`) because its two consumers are cross-cutting:
 * SF-3's `OrdersService.create` needs a bulk per-route lookup inside its
 * transaction on every order, and SF-6's admin UI needs simple set/clear
 * endpoints — neither belongs in the products CRUD surface. Exported from
 * `ShippingFeeModule` so `OrdersModule` can import it directly.
 */
@Injectable()
export class ProductShippingFeeOverrideService {
  constructor(
    @InjectRepository(ProductShippingFeeOverride)
    private readonly overrideRepo: Repository<ProductShippingFeeOverride>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly auditService: AuditService,
  ) {}

  private async ensureProductExists(productId: string): Promise<void> {
    const exists = await this.productRepo.existsBy({ id: productId });
    if (!exists) throw new NotFoundException('Product not found');
  }

  /**
   * Upserts the override for one (product, route, currency): a second call
   * for the same combination replaces the amount in place — no history is
   * kept (deliberately unlike the append-only global default, see the
   * entity's doc comment). Atomic via a single `INSERT ... ON CONFLICT
   * (productId, originCountry, destinationCountry, currency) DO UPDATE`, so
   * two concurrent upserts for the same combination race-free to a single
   * final row instead of racing to a duplicate-key error.
   */
  async set(
    productId: string,
    dto: SetProductShippingFeeOverrideDto,
    userId: string,
  ): Promise<ProductShippingFeeOverrideDto> {
    await this.ensureProductExists(productId);

    const now = new Date();
    await this.overrideRepo.upsert(
      {
        productId,
        originCountry: dto.originCountry,
        destinationCountry: dto.destinationCountry,
        currency: dto.currency,
        amount: dto.amount,
        updatedByUserId: userId ?? null,
        updatedAt: now,
      },
      ['productId', 'originCountry', 'destinationCountry', 'currency'],
    );

    const row = await this.overrideRepo.findOneOrFail({
      where: {
        productId,
        originCountry: dto.originCountry,
        destinationCountry: dto.destinationCountry,
        currency: dto.currency,
      },
    });

    await this.auditService.log({
      userId,
      action: AuditAction.PRODUCT_SHIPPING_FEE_OVERRIDE_SET,
      entityType: 'product_shipping_fee_override',
      entityId: row.id,
      metadata: {
        productId,
        originCountry: dto.originCountry,
        destinationCountry: dto.destinationCountry,
        currency: dto.currency,
        amount: dto.amount,
      },
    });

    return toDto(row);
  }

  /**
   * Clears the override for one (product, route, currency), reverting that
   * exact combination to the global default. Idempotent: clearing a
   * combination with no override is a no-op, not an error — only an unknown
   * `productId` 404s.
   */
  async clear(
    productId: string,
    dto: ClearProductShippingFeeOverrideDto,
    userId: string,
  ): Promise<void> {
    await this.ensureProductExists(productId);

    const result = await this.overrideRepo.delete({
      productId,
      originCountry: dto.originCountry,
      destinationCountry: dto.destinationCountry,
      currency: dto.currency,
    });

    if (result.affected) {
      await this.auditService.log({
        userId,
        action: AuditAction.PRODUCT_SHIPPING_FEE_OVERRIDE_CLEARED,
        entityType: 'product_shipping_fee_override',
        entityId: productId,
        metadata: {
          productId,
          originCountry: dto.originCountry,
          destinationCountry: dto.destinationCountry,
          currency: dto.currency,
        },
      });
    }
  }

  /** All overrides currently set for one product, across whatever routes/currencies an admin has configured. */
  async listForProduct(productId: string): Promise<ProductShippingFeeOverrideDto[]> {
    await this.ensureProductExists(productId);
    const rows = await this.overrideRepo.find({ where: { productId } });
    return rows.map(toDto);
  }

  /**
   * Bulk lookup for SF-3's order-creation path: given a set of productIds and
   * one exact (route, currency), returns the override amount for every
   * product in that set that has one — a single indexed query, never N. A
   * product absent from the returned map has no override for this exact
   * (route, currency) and must fall back to
   * `ShippingFeeService.getFeeAt`. An override never leaks across routes or
   * currencies: this only ever matches the one (originCountry,
   * destinationCountry, currency) triple passed in.
   */
  async findOverrideAmounts(
    productIds: string[],
    originCountry: CountryCode,
    destinationCountry: CountryCode,
    currency: CurrencyCode,
  ): Promise<Map<string, number>> {
    // Cheap common case: no products (or the caller already knows none of them
    // are overridden) — skip the round-trip entirely.
    if (productIds.length === 0) return new Map();

    const rows = await this.overrideRepo.find({
      where: {
        productId: In(productIds),
        originCountry,
        destinationCountry,
        currency,
      },
    });

    const amounts = new Map<string, number>();
    for (const row of rows) {
      amounts.set(row.productId, Number(row.amount));
    }
    return amounts;
  }
}
