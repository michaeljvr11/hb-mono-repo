import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  AddressDto,
  CountryCode,
  CurrencyCode,
  OrderDto,
  OrderItemDto,
  OrderStatus,
  OrderStatusOverrideAuditDto,
  PaymentStatus,
  UserRole,
  VendorOrderLineDto,
} from '@hb/shared';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusOverride } from './entities/order-status-override.entity';
import { Cart } from '../cart/entities/cart.entity';
import { CartItem } from '../cart/entities/cart-item.entity';
import { Product } from '../products/entities/product.entity';
import { Address } from '../addresses/entities/address.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { User } from '../users/entities/user.entity';
import { PAYMENT_PROVIDER } from '../payments/payment-provider.port';
import type { PaymentProviderPort } from '../payments/payment-provider.port';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatusOverrideDto } from './dto/order-status-override.dto';
import { CommissionRateService } from '../commission/commission-rate.service';
import { ShippingFeeService } from '../shipping-fee/shipping-fee.service';
import { ProductShippingFeeOverrideService } from '../shipping-fee/product-shipping-fee-override.service';
import { resolveCartOriginCountry } from '../shipping-fee/cart-origin.util';
import { OrderEvents } from '../common/events/domain-events';

/**
 * Order State Machine (vault: "Order State Machine", confirmed 2026-06-18):
 *
 *   pending → confirmed → processing → handed_to_hb → shipped → delivered
 *      ↘ cancelled (from pending/confirmed only; later cancellation = TBD)
 *
 * Every transition goes through {@link OrdersService.updateStatus} (or the
 * internal payment-confirmation path), which validates the from-state.
 * No direct status writes from controllers.
 */
export const ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.HANDED_TO_HB],
  [OrderStatus.HANDED_TO_HB]: [OrderStatus.SHIPPED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

/** Transitions a vendor may perform on orders containing their lines. */
const VENDOR_ALLOWED_TARGETS: readonly OrderStatus[] = [
  OrderStatus.PROCESSING,
  OrderStatus.HANDED_TO_HB,
];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    @InjectRepository(Vendor)
    private vendorsRepository: Repository<Vendor>,
    @InjectRepository(OrderItem)
    private orderItemsRepository: Repository<OrderItem>,
    @InjectRepository(OrderStatusOverride)
    private orderStatusOverridesRepository: Repository<OrderStatusOverride>,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProviderPort,
    private readonly dataSource: DataSource,
    private readonly commissionRateService: CommissionRateService,
    private readonly shippingFeeService: ShippingFeeService,
    private readonly productShippingFeeOverrideService: ProductShippingFeeOverrideService,
    private eventEmitter: EventEmitter2,
  ) {}

  async findAllForUser(userId: string): Promise<OrderDto[]> {
    const orders = await this.ordersRepository.find({
      where: { userId },
      relations: ['items', 'shippingAddress'],
      order: { createdAt: 'DESC' },
    });
    return orders.map((order) => this.toDto(order));
  }

  /** Owner (or admin) order detail — checkout confirmation reads this. */
  async findOneForUser(user: User, orderId: string): Promise<OrderDto> {
    const where = user.role === UserRole.ADMIN ? { id: orderId } : { id: orderId, userId: user.id };
    const order = await this.ordersRepository.findOne({
      where,
      relations: ['items', 'shippingAddress'],
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.toDto(order);
  }

  /**
   * Vendor's own order lines across all orders — the read model behind the
   * vendor portal fulfilment queue. Ownership is enforced by `vendorId` on
   * `order_items`, mirroring {@link assertActorMayTransition}'s vendor-row
   * lookup. 404s if the caller has no vendor row (mirrors that pattern too).
   */
  async findAllForVendor(userId: string): Promise<VendorOrderLineDto[]> {
    const vendor = await this.vendorsRepository.findOne({ where: { userId } });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const items = await this.orderItemsRepository.find({
      where: { vendorId: vendor.id },
      relations: ['order'],
      order: { createdAt: 'DESC' },
    });

    return items.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      orderStatus: item.order.status,
      orderCreatedAt: item.order.createdAt.toISOString(),
      productName: item.productName,
      unitPrice: Number(item.unitPrice),
      currency: item.currency,
      quantity: item.quantity,
    }));
  }

  /**
   * Create an order from the caller's server-side cart.
   *
   * - Requires a verified email (Auth & Roles: verification is not needed to
   *   browse, but IS needed to place an order) → 403 otherwise.
   * - All money math happens server-side in integer cents from LIVE product
   *   prices; a client-submitted total is never accepted.
   * - Stock is re-checked and decremented inside one DB transaction with a
   *   pessimistic row lock per product (deterministic id order to avoid
   *   deadlocks) — two simultaneous checkouts cannot oversell a product, and
   *   an insufficient-stock failure rolls back with no partial writes.
   * - Unit prices/listing type/vendor are snapshotted onto order_items at
   *   purchase time and never recomputed from live prices later.
   * - Payment goes through the PAYMENT_PROVIDER port (deterministic stub
   *   today); once the provider reports the money secured, the order moves
   *   pending → confirmed per the state machine.
   */
  async create(user: User, dto: CreateOrderDto): Promise<OrderDto> {
    if (!user.isVerified) {
      throw new ForbiddenException('Verify your email before placing an order');
    }

    const order = await this.dataSource.transaction(async (manager) => {
      const cart = await manager.findOne(Cart, {
        where: { userId: user.id },
        relations: ['items'],
      });
      if (!cart || !cart.items?.length) {
        throw new BadRequestException('Your cart is empty');
      }

      // Lock products in a deterministic order so two concurrent checkouts
      // sharing products can never deadlock.
      const cartItems = [...cart.items].sort((a, b) => a.productId.localeCompare(b.productId));

      const currencies = new Set<CurrencyCode>();
      const originCountries = new Set<CountryCode>();
      const lines: Array<Partial<OrderItem>> = [];
      let subtotalCents = 0;

      // Resolved once per order (not per line) so every line in the same
      // order snapshots the identical rate, even if a rate change lands
      // mid-loop — the Vendor Earnings & Commission spec requires one
      // consistent commission-rate snapshot per order, never recomputed
      // per line.
      const orderCreatedAt = new Date();
      const commissionRate = await this.commissionRateService.getRateAt(orderCreatedAt);

      for (const cartItem of cartItems) {
        // Row lock; eager relations are skipped because FOR UPDATE cannot be
        // applied to the nullable side of the image/category joins.
        const product = await manager.findOne(Product, {
          where: { id: cartItem.productId },
          lock: { mode: 'pessimistic_write' },
          loadEagerRelations: false,
        });
        if (!product) {
          throw new BadRequestException('A product in your cart is no longer available');
        }
        if (product.stockQuantity < cartItem.quantity) {
          throw new ConflictException(
            `Insufficient stock for '${product.name}' — only ${product.stockQuantity} left`,
          );
        }

        const unitCents = Math.round(Number(product.price) * 100);
        subtotalCents += unitCents * cartItem.quantity;
        currencies.add(product.currency);
        originCountries.add(product.originCountry);

        lines.push({
          productId: product.id,
          productName: product.name, // snapshot — the product row may change later
          unitPrice: unitCents / 100, // snapshot at purchase time
          currency: product.currency,
          quantity: cartItem.quantity,
          listingType: product.listingType,
          vendorId: product.vendorId ?? undefined,
          // Platform lines (no vendor) carry no commission — see the "no
          // fake house vendor" invariant (Listing Types & Vendor Rules).
          commissionRatePercent: product.vendorId ? commissionRate.ratePercent : null,
        });

        await manager.update(Product, product.id, {
          stockQuantity: product.stockQuantity - cartItem.quantity,
        });
      }

      // One order carries one currency. ZAR and NAD are pegged 1:1 but are
      // never summed together (Money & Currency Rules) — a mixed cart cannot
      // produce a single honest total.
      if (currencies.size > 1) {
        throw new BadRequestException(
          'Your cart mixes ZAR and NAD items — please check out one currency at a time',
        );
      }
      const [currency] = currencies;

      // The route this order is placed on — constant across every line
      // (one origin, one destination per order). Computed once and reused
      // both for fee resolution below and for the order row itself, so the
      // route a fee is resolved against is exactly the route that gets
      // written (SF-3). `resolveCartOriginCountry` also backs SF-4's
      // checkout preview endpoint, so the two can never resolve different
      // origins for the same cart.
      const originCountry = resolveCartOriginCountry(originCountries);
      const destinationCountry = dto.shippingAddress.countryCode;

      const shippingAddress = await manager.save(Address, {
        ...dto.shippingAddress,
        userId: user.id,
      });

      // Shipping fee (SF-3): each line resolves to the product's
      // (route, currency) override if one is set (SF-5), else the global
      // default (SF-1) — resolved against the same `orderCreatedAt` instant
      // as the commission snapshot above, so a mid-checkout fee change can
      // never split an order. shippingTotal is the MAX across every line's
      // resolved fee, not a sum — the highest applicable fee for the cart
      // wins. `getFeeAt` throws rather than returning 0, so a missing fee
      // config fails order creation instead of silently charging nothing.
      const productIds = lines.map((line) => line.productId).filter((id): id is string => !!id);
      const overrideAmounts = await this.productShippingFeeOverrideService.findOverrideAmounts(
        productIds,
        originCountry,
        destinationCountry,
        currency,
      );
      const defaultFee = await this.shippingFeeService.getFeeAt(
        orderCreatedAt,
        originCountry,
        destinationCountry,
        currency,
      );
      const defaultFeeCents = Math.round(defaultFee.amount * 100);
      let shippingCents = 0;
      for (const productId of productIds) {
        const overrideAmount = overrideAmounts.get(productId);
        const lineFeeCents =
          overrideAmount !== undefined ? Math.round(overrideAmount * 100) : defaultFeeCents;
        if (lineFeeCents > shippingCents) shippingCents = lineFeeCents;
      }

      const saved = await manager.save(Order, {
        userId: user.id,
        status: OrderStatus.PENDING,
        currency,
        subtotal: subtotalCents / 100,
        shippingTotal: shippingCents / 100,
        total: (subtotalCents + shippingCents) / 100,
        originCountry,
        destinationCountry,
        shippingAddressId: shippingAddress.id,
        items: lines,
      });

      // The cart was staged for exactly this purchase — clear it.
      await manager.delete(CartItem, { cartId: cart.id });

      return saved;
    });

    // Payment runs outside the stock transaction (external call). The stub
    // provider authorizes deterministically; when a real provider lands this
    // becomes an async webhook path and 'pending' orders simply wait longer.
    await this.capturePayment(order);

    return this.findOneForUser(user, order.id);
  }

  /**
   * Single gateway for every status change. Validates the from-state against
   * the state machine and the actor's transition rights:
   * - admin: full rights across all states;
   * - vendor: `confirmed → processing → handed_to_hb` only, and only on
   *   orders containing their own lines;
   * - customer: cancel their own order while it is pending/confirmed.
   */
  async updateStatus(actor: User, orderId: string, next: OrderStatus): Promise<OrderDto> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['items', 'shippingAddress'],
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.assertActorMayTransition(actor, order, next);
    this.assertValidTransition(order.status, next);

    order.status = next;
    const saved = await this.ordersRepository.save(order);

    // The one and only place deliveredAt gets stamped (vault: "Vendor
    // Earnings & Commission" data model point 1) — the payout-eligibility
    // clock's anchor. `ORDER_STATUS_TRANSITIONS` only allows reaching
    // `delivered` from `shipped`, so checking `next` alone is equivalent to
    // "on the shipped → delivered transition". The in-memory `deliveredAt ==
    // null` check is only a fast-path guard against a real timestamp: the
    // read-then-write `findOne` → mutate → `save` pattern above has no row
    // lock, so two concurrent admin `shipped → delivered` calls could both
    // observe `deliveredAt == null` and both stamp, last-write-wins shifting
    // the payout clock by the race window. Since `deliveredAt` is a
    // money-timing anchor, the actual write is a conditional UPDATE ...
    // WHERE "deliveredAt" IS NULL, atomic at the DB level, so only the first
    // of two racing calls ever succeeds in stamping it.
    if (next === OrderStatus.DELIVERED && order.deliveredAt == null) {
      const stampedAt = new Date();
      await this.ordersRepository.update(
        { id: orderId, deliveredAt: IsNull() },
        { deliveredAt: stampedAt },
      );
      saved.deliveredAt = stampedAt;
    }

    return this.toDto(saved);
  }

  /**
   * Admin-only escape hatch (vault: "Order State Machine" § "Admin override",
   * confirmed 2026-08-16). Deliberately bypasses `assertValidTransition` /
   * `ORDER_STATUS_TRANSITIONS` entirely — any status to any status, including
   * re-entering/leaving terminal states — so that matrix's "single validated
   * gateway" guarantee stays intact for every other caller. Role enforcement
   * is `@Roles(UserRole.ADMIN)` at the controller; this method trusts its
   * caller is already an admin.
   *
   * A no-op override (`dto.status === order.status`) is rejected outright —
   * no write, no audit row, no event — otherwise "type a reason, hit
   * Override" without touching the status select (the web control defaults
   * to the current status) would silently re-fire `order.paid` and re-send
   * the confirmation email fan-out for an order that was already confirmed.
   *
   * The order save, the conditional `deliveredAt` stamp, and the audit-row
   * insert all happen in one DB transaction — a bypassed status change must
   * never land without its audit trail, even if the audit insert fails.
   *
   * `deliveredAt` is only ever stamped on entering `delivered` (same
   * race-safe conditional UPDATE as `updateStatus`) — moving OUT of
   * `delivered` deliberately leaves it untouched, since it's a historical
   * payout-clock anchor, not a live status flag.
   *
   * The audit row is written unconditionally; the `order.paid` domain event
   * fires only when `sendNotifications` is true AND the target is
   * `CONFIRMED` — there is no dedicated domain event for other target
   * statuses today (see `common/events/domain-events.ts`). The event is
   * emitted after the transaction commits (best-effort, same as every other
   * `order.paid` emitter — see the doc comment on `OrderEvents`).
   */
  async overrideStatus(
    admin: User,
    orderId: string,
    dto: OrderStatusOverrideDto,
  ): Promise<OrderDto> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['items', 'shippingAddress'],
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const fromStatus = order.status;
    if (fromStatus === dto.status) {
      throw new ConflictException('Order is already in this status');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      order.status = dto.status;
      const savedOrder = await manager.save(Order, order);

      if (dto.status === OrderStatus.DELIVERED && order.deliveredAt == null) {
        const stampedAt = new Date();
        await manager.update(
          Order,
          { id: orderId, deliveredAt: IsNull() },
          { deliveredAt: stampedAt },
        );
        savedOrder.deliveredAt = stampedAt;
      }

      await manager.save(OrderStatusOverride, {
        orderId,
        adminUserId: admin.id,
        fromStatus,
        toStatus: dto.status,
        reason: dto.reason,
        sendNotifications: dto.sendNotifications,
      });

      return savedOrder;
    });

    if (dto.sendNotifications && dto.status === OrderStatus.CONFIRMED) {
      this.eventEmitter.emit(OrderEvents.PAID, { orderId });
    }

    return this.toDto(saved);
  }

  /**
   * Override history for one order, newest first — the admin audit view.
   * 404s on an unknown order, same as `overrideStatus`, rather than silently
   * returning an empty list.
   */
  async findOverridesForOrder(orderId: string): Promise<OrderStatusOverrideAuditDto[]> {
    const order = await this.ordersRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // leftJoin against `users` (already a registered entity on this
    // connection) rather than a denormalised column — the admin email is
    // display-only context for the audit view.
    const { entities, raw } = await this.orderStatusOverridesRepository
      .createQueryBuilder('override')
      .leftJoin(User, 'admin', 'admin.id = override.adminUserId')
      .addSelect('admin.email', 'adminEmail')
      .where('override.orderId = :orderId', { orderId })
      .orderBy('override.createdAt', 'DESC')
      .getRawAndEntities<{ adminEmail: string | null }>();

    return entities.map((o, i) => ({
      id: o.id,
      orderId: o.orderId,
      adminUserId: o.adminUserId,
      adminEmail: raw[i]?.adminEmail ?? undefined,
      fromStatus: o.fromStatus,
      toStatus: o.toStatus,
      reason: o.reason,
      sendNotifications: o.sendNotifications,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async capturePayment(order: Order): Promise<void> {
    const amount = Number(order.total);
    const intent = await this.paymentProvider.initiatePayment({
      orderId: order.id,
      amount,
      currency: order.currency,
    });

    const providerStatus = await this.paymentProvider.getPaymentStatus(intent.providerRef);
    const paymentStatus =
      providerStatus === 'paid'
        ? PaymentStatus.PAID
        : providerStatus === 'failed'
          ? PaymentStatus.FAILED
          : PaymentStatus.PENDING;

    await this.paymentsRepository.save(
      this.paymentsRepository.create({
        orderId: order.id,
        amount,
        currency: order.currency,
        status: paymentStatus,
        provider: intent.provider,
        providerRef: intent.providerRef,
      }),
    );

    if (paymentStatus === PaymentStatus.PAID) {
      // Payment secured → pending → confirmed (state-machine trigger:
      // "payment authorized/paid"). Same validation path as every transition.
      this.assertValidTransition(order.status, OrderStatus.CONFIRMED);
      order.status = OrderStatus.CONFIRMED;
      await this.ordersRepository.save(order);

      // Paid-and-confirmed → vendor/platform transactional notifications
      // (OrderNotificationsListener). Best-effort, no safety net (see
      // OrderEvents doc comment) — must never affect this request/response.
      this.eventEmitter.emit(OrderEvents.PAID, { orderId: order.id });
    } else {
      this.logger.warn(
        `Payment for order ${order.id} is '${providerStatus}' — order stays '${order.status}'`,
      );
    }
  }

  private assertValidTransition(from: OrderStatus, to: OrderStatus): void {
    const allowed = ORDER_STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new ConflictException(`Cannot change order status from '${from}' to '${to}'`);
    }
  }

  private async assertActorMayTransition(
    actor: User,
    order: Order,
    next: OrderStatus,
  ): Promise<void> {
    if (actor.role === UserRole.ADMIN) {
      return; // full transition rights across all states
    }

    if (actor.role === UserRole.VENDOR) {
      // A vendor may also be the buying customer — cancelling their own
      // purchase uses the customer rule below.
      if (next === OrderStatus.CANCELLED && order.userId === actor.id) {
        return;
      }
      if (!VENDOR_ALLOWED_TARGETS.includes(next)) {
        throw new ForbiddenException('Vendors may only move orders to processing or handed_to_hb');
      }
      const vendor = await this.vendorsRepository.findOne({ where: { userId: actor.id } });
      const ownsALine = !!vendor && order.items.some((item) => item.vendorId === vendor.id);
      if (!ownsALine) {
        // Do not leak the order's existence to unrelated vendors.
        throw new NotFoundException('Order not found');
      }
      return;
    }

    // Customer: may only cancel their own order (from-state validated after).
    if (order.userId !== actor.id) {
      throw new NotFoundException('Order not found');
    }
    if (next !== OrderStatus.CANCELLED) {
      throw new ForbiddenException('You may only cancel your order');
    }
  }

  private toDto(order: Order): OrderDto {
    const items: OrderItemDto[] = (order.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId ?? undefined,
      productName: item.productName,
      unitPrice: Number(item.unitPrice),
      currency: item.currency,
      quantity: item.quantity,
      listingType: item.listingType,
      vendorId: item.vendorId ?? undefined,
    }));

    let shippingAddress: AddressDto | undefined;
    if (order.shippingAddress) {
      const a = order.shippingAddress;
      shippingAddress = {
        id: a.id,
        recipientName: a.recipientName,
        line1: a.line1,
        line2: a.line2 ?? undefined,
        city: a.city,
        region: a.region ?? undefined,
        postalCode: a.postalCode ?? undefined,
        countryCode: a.countryCode,
        phone: a.phone ?? undefined,
      };
    }

    return {
      id: order.id,
      status: order.status,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      shippingTotal: Number(order.shippingTotal),
      total: Number(order.total),
      originCountry: order.originCountry,
      destinationCountry: order.destinationCountry,
      shippingAddress,
      items,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}
