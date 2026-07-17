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
import { DataSource, Repository } from 'typeorm';
import {
  AddressDto,
  CountryCode,
  CurrencyCode,
  OrderDto,
  OrderItemDto,
  OrderStatus,
  PaymentStatus,
  UserRole,
  VendorOrderLineDto,
} from '@hb/shared';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
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
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProviderPort,
    private readonly dataSource: DataSource,
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

      const shippingAddress = await manager.save(Address, {
        ...dto.shippingAddress,
        userId: user.id,
      });

      // Cross-border delivery fee structure is an open business decision
      // (HB Domain Model TBD) — until priced, shipping is explicitly 0.00.
      const shippingCents = 0;

      const saved = await manager.save(Order, {
        userId: user.id,
        status: OrderStatus.PENDING,
        currency,
        subtotal: subtotalCents / 100,
        shippingTotal: shippingCents / 100,
        total: (subtotalCents + shippingCents) / 100,
        originCountry:
          originCountries.size === 1 ? [...originCountries][0] : CountryCode.SOUTH_AFRICA,
        destinationCountry: dto.shippingAddress.countryCode,
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
    return this.toDto(saved);
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
