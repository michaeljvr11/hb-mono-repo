import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { CurrencyCode, ListingType, OrderStatus, PaymentStatus, UserRole } from '@hb/shared';
import { ORDER_STATUS_TRANSITIONS, OrdersService } from './orders.service';
import { OrderEvents } from '../common/events/domain-events';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusOverride } from './entities/order-status-override.entity';
import { Cart } from '../cart/entities/cart.entity';
import { Product } from '../products/entities/product.entity';
import { Address } from '../addresses/entities/address.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { User } from '../users/entities/user.entity';
import { PAYMENT_PROVIDER } from '../payments/payment-provider.port';
import { CreateOrderDto } from './dto/create-order.dto';
import { CommissionRateService } from '../commission/commission-rate.service';
import { ShippingFeeResolverService } from '../shipping-fee/shipping-fee-resolver.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NOW = new Date('2026-07-07T09:00:00.000Z');

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'customer@hb.com',
    role: UserRole.CUSTOMER,
    isActive: true,
    isVerified: true,
    ...overrides,
  } as User;
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Fynbos Honey',
    price: '185.00' as never, // pg returns numeric as string
    currency: CurrencyCode.ZAR,
    stockQuantity: 10,
    originCountry: 'ZA',
    listingType: ListingType.PLATFORM,
    vendorId: undefined,
    ...overrides,
  } as Product;
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    userId: 'user-1',
    status: OrderStatus.PENDING,
    currency: CurrencyCode.ZAR,
    subtotal: 370,
    shippingTotal: 0,
    total: '370.00' as never, // pg returns numeric as string
    originCountry: 'ZA',
    destinationCountry: 'NA',
    items: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Order;
}

function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'line-1',
    orderId: 'order-1',
    productName: 'Fynbos Honey',
    unitPrice: '185.00' as never,
    currency: CurrencyCode.ZAR,
    quantity: 2,
    listingType: ListingType.VENDOR,
    vendorId: 'vendor-1',
    createdAt: NOW,
    ...overrides,
  } as OrderItem;
}

const SHIPPING_DTO: CreateOrderDto = {
  shippingAddress: {
    recipientName: 'Johannes Shipanga',
    line1: '12 Independence Ave',
    city: 'Windhoek',
    region: 'Khomas',
    countryCode: 'NA',
  },
};

/** ZA→NA default shipping fee used across the money-math suite unless a test overrides it. */
const DEFAULT_SHIPPING_FEE = {
  id: 'fee-za-na-zar',
  amount: 250,
  currency: CurrencyCode.ZAR,
  originCountry: 'ZA',
  destinationCountry: 'NA',
  effectiveFrom: NOW.toISOString(),
  createdAt: NOW.toISOString(),
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepo: Record<string, jest.Mock>;
  let paymentsRepo: Record<string, jest.Mock>;
  let vendorsRepo: Record<string, jest.Mock>;
  let orderItemsRepo: Record<string, jest.Mock>;
  let orderStatusOverridesRepo: Record<string, jest.Mock>;
  let paymentProvider: Record<string, jest.Mock>;
  let commissionRateService: Record<string, jest.Mock>;
  let shippingFeeResolverService: Record<string, jest.Mock>;
  let eventEmitter: Record<string, jest.Mock>;
  let manager: Record<string, jest.Mock>;
  let dataSourceMock: Record<string, jest.Mock>;

  /** Per-entity dispatch for the transactional EntityManager mock. */
  let cartFixture: Cart | null;
  let productFixtures: Map<string, Product>;

  beforeEach(async () => {
    cartFixture = null;
    productFixtures = new Map();

    manager = {
      findOne: jest.fn((entity: unknown, options: { where?: { id?: string } }) => {
        if (entity === Cart) return Promise.resolve(cartFixture);
        if (entity === Product) {
          return Promise.resolve(productFixtures.get(options.where?.id ?? '') ?? null);
        }
        return Promise.resolve(null);
      }),
      save: jest.fn((entity: unknown, value: Record<string, unknown>) => {
        if (entity === Address) return Promise.resolve({ ...value, id: 'addr-1' });
        if (entity === Order) {
          return Promise.resolve({ ...value, id: 'order-1', createdAt: NOW, updatedAt: NOW });
        }
        return Promise.resolve(value);
      }),
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
    };

    ordersRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((o: Order) => Promise.resolve(o)),
      update: jest.fn(() => Promise.resolve({ affected: 1 })),
    };
    paymentsRepo = {
      create: jest.fn((p: Partial<Payment>) => p as Payment),
      save: jest.fn((p: Payment) => Promise.resolve(p)),
    };
    vendorsRepo = { findOne: jest.fn() };
    orderItemsRepo = { find: jest.fn() };
    orderStatusOverridesRepo = {
      createQueryBuilder: jest.fn(),
    };
    paymentProvider = {
      initiatePayment: jest.fn(() =>
        Promise.resolve({ provider: 'stub', providerRef: 'stub_ref_1' }),
      ),
      getPaymentStatus: jest.fn(() => Promise.resolve('paid')),
      refund: jest.fn(),
    };
    commissionRateService = {
      getRateAt: jest.fn(() =>
        Promise.resolve({
          id: 'rate-1',
          ratePercent: 15,
          effectiveFrom: NOW.toISOString(),
          createdAt: NOW.toISOString(),
        }),
      ),
    };
    // Default: DEFAULT_SHIPPING_FEE.amount (250) in integer cents — the
    // money logic itself (MAX-across-lines, override-or-default) now lives
    // in ShippingFeeResolverService and is unit-tested there directly (see
    // shipping-fee-resolver.service.spec.ts); this suite only verifies
    // OrdersService calls it with the right route/currency/productIds/instant
    // and correctly turns the returned cents into shippingTotal/total.
    shippingFeeResolverService = {
      resolveShippingCents: jest.fn(() => Promise.resolve(DEFAULT_SHIPPING_FEE.amount * 100)),
    };
    eventEmitter = { emit: jest.fn() };

    dataSourceMock = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager as unknown as EntityManager),
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: ordersRepo },
        { provide: getRepositoryToken(Payment), useValue: paymentsRepo },
        { provide: getRepositoryToken(Vendor), useValue: vendorsRepo },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemsRepo },
        { provide: getRepositoryToken(OrderStatusOverride), useValue: orderStatusOverridesRepo },
        { provide: PAYMENT_PROVIDER, useValue: paymentProvider },
        { provide: DataSource, useValue: dataSourceMock },
        { provide: CommissionRateService, useValue: commissionRateService },
        { provide: ShippingFeeResolverService, useValue: shippingFeeResolverService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  function stageCart(items: Array<{ productId: string; quantity: number }>, product?: Product[]) {
    cartFixture = {
      id: 'cart-1',
      userId: 'user-1',
      items: items.map((i, idx) => ({ id: `ci-${idx}`, cartId: 'cart-1', ...i })),
    } as Cart;
    for (const p of product ?? []) {
      productFixtures.set(p.id, p);
    }
    // findOneForUser at the end of create()
    ordersRepo.findOne.mockResolvedValue(
      makeOrder({ status: OrderStatus.CONFIRMED, items: [makeOrderItem()] }),
    );
  }

  // ── isVerified gate (card #15) ─────────────────────────────────────────────

  describe('email-verification gate', () => {
    it('rejects order placement for unverified users with 403', async () => {
      const unverified = makeUser({ isVerified: false });

      await expect(service.create(unverified, SHIPPING_DTO)).rejects.toMatchObject({
        constructor: ForbiddenException,
        message: 'Verify your email before placing an order',
      });
      // Nothing was touched: no transaction, no payment.
      expect(manager.findOne).not.toHaveBeenCalled();
      expect(paymentProvider.initiatePayment).not.toHaveBeenCalled();
    });

    it('allows verified users through the gate', async () => {
      stageCart([{ productId: 'prod-1', quantity: 2 }], [makeProduct()]);

      await expect(service.create(makeUser(), SHIPPING_DTO)).resolves.toBeDefined();
    });
  });

  // ── Order creation: money math ─────────────────────────────────────────────

  describe('create — server-side money math', () => {
    it('computes subtotal and total from live prices in integer cents', async () => {
      stageCart(
        [
          { productId: 'prod-1', quantity: 3 },
          { productId: 'prod-2', quantity: 1 },
        ],
        [
          makeProduct({ id: 'prod-1', price: '19.99' as never }),
          makeProduct({ id: 'prod-2', price: '0.10' as never }),
        ],
      );

      await service.create(makeUser(), SHIPPING_DTO);

      // 3 × 19.99 + 0.10 = 60.07 — exact, no float drift. shippingTotal is
      // the resolved default fee (SF-3, DEFAULT_SHIPPING_FEE.amount = 250),
      // no longer hardcoded 0 — total includes it.
      expect(manager.save).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({
          subtotal: 60.07,
          shippingTotal: 250,
          total: 310.07,
          currency: CurrencyCode.ZAR,
          status: OrderStatus.PENDING,
        }),
      );
    });

    it('snapshots unit price, name, listing type and vendor per line', async () => {
      stageCart(
        [{ productId: 'prod-1', quantity: 2 }],
        [
          makeProduct({
            id: 'prod-1',
            name: 'Kalahari Salt',
            price: '42.50' as never,
            listingType: ListingType.VENDOR,
            vendorId: 'vendor-9',
          }),
        ],
      );

      await service.create(makeUser(), SHIPPING_DTO);

      expect(manager.save).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({
          items: [
            expect.objectContaining({
              productId: 'prod-1',
              productName: 'Kalahari Salt',
              unitPrice: 42.5,
              currency: CurrencyCode.ZAR,
              quantity: 2,
              listingType: ListingType.VENDOR,
              vendorId: 'vendor-9',
            }),
          ],
        }),
      );
    });

    it('snapshots commissionRatePercent from getRateAt on vendor lines, null on platform lines', async () => {
      stageCart(
        [
          { productId: 'prod-vendor', quantity: 1 },
          { productId: 'prod-platform', quantity: 1 },
        ],
        [
          makeProduct({
            id: 'prod-vendor',
            listingType: ListingType.VENDOR,
            vendorId: 'vendor-9',
          }),
          makeProduct({
            id: 'prod-platform',
            listingType: ListingType.PLATFORM,
            vendorId: undefined,
          }),
        ],
      );

      await service.create(makeUser(), SHIPPING_DTO);

      // Resolved exactly once per order creation, not once per line.
      expect(commissionRateService.getRateAt).toHaveBeenCalledTimes(1);
      expect(commissionRateService.getRateAt).toHaveBeenCalledWith(expect.any(Date));

      expect(manager.save).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({
          // cartItems are locked/processed in deterministic productId order
          // ('prod-platform' < 'prod-vendor' lexicographically).
          items: [
            expect.objectContaining({ productId: 'prod-platform', commissionRatePercent: null }),
            expect.objectContaining({ productId: 'prod-vendor', commissionRatePercent: 15 }),
          ],
        }),
      );
    });

    it('uses one consistent timestamp across every line in the same order', async () => {
      stageCart(
        [
          { productId: 'prod-a', quantity: 1 },
          { productId: 'prod-b', quantity: 1 },
        ],
        [
          makeProduct({ id: 'prod-a', vendorId: 'vendor-1' }),
          makeProduct({ id: 'prod-b', vendorId: 'vendor-2' }),
        ],
      );

      await service.create(makeUser(), SHIPPING_DTO);

      // Only one call total covers both lines — same resolved Date argument.
      expect(commissionRateService.getRateAt).toHaveBeenCalledTimes(1);
      expect(commissionRateService.getRateAt).toHaveBeenCalledWith(expect.any(Date));
    });

    it('rejects a mixed-currency cart (ZAR and NAD are never summed together)', async () => {
      stageCart(
        [
          { productId: 'prod-1', quantity: 1 },
          { productId: 'prod-2', quantity: 1 },
        ],
        [
          makeProduct({ id: 'prod-1', currency: CurrencyCode.ZAR }),
          makeProduct({ id: 'prod-2', currency: CurrencyCode.NAD }),
        ],
      );

      await expect(service.create(makeUser(), SHIPPING_DTO)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an empty cart', async () => {
      cartFixture = { id: 'cart-1', userId: 'user-1', items: [] } as never;

      await expect(service.create(makeUser(), SHIPPING_DTO)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  // ── Order creation: shipping fee (SF-3) ────────────────────────────────────

  describe('create — shipping fee resolution (SF-3)', () => {
    // The MAX(override, default)-across-lines money logic itself now lives
    // in ShippingFeeResolverService and is unit-tested there (see
    // shipping-fee-resolver.service.spec.ts) and cross-checked against the
    // checkout preview in shipping-fee-preview-parity.spec.ts. This block
    // verifies OrdersService's side of the contract only: it calls the
    // resolver with the right route/currency/productIds/instant, and it
    // turns the returned cents into shippingTotal/total correctly.

    it('resolves via the shared resolver for the order route (ZA→NA), not another route', async () => {
      stageCart([{ productId: 'prod-1', quantity: 1 }], [makeProduct({ originCountry: 'ZA' })]);

      await service.create(makeUser(), SHIPPING_DTO);

      expect(shippingFeeResolverService.resolveShippingCents).toHaveBeenCalledWith(
        ['prod-1'],
        'ZA',
        'NA',
        CurrencyCode.ZAR,
        expect.any(Date),
      );
    });

    it('resolves via the shared resolver for the order route (NA→NA), not the ZA→NA route', async () => {
      stageCart([{ productId: 'prod-1', quantity: 1 }], [makeProduct({ originCountry: 'NA' })]);

      await service.create(makeUser(), {
        shippingAddress: { ...SHIPPING_DTO.shippingAddress, countryCode: 'NA' },
      });

      expect(shippingFeeResolverService.resolveShippingCents).toHaveBeenCalledWith(
        ['prod-1'],
        'NA',
        'NA',
        CurrencyCode.ZAR,
        expect.any(Date),
      );
    });

    it("resolves via the shared resolver for the order's own currency (NAD), not the ZAR pegged equivalent", async () => {
      stageCart(
        [{ productId: 'prod-1', quantity: 1 }],
        [makeProduct({ currency: CurrencyCode.NAD })],
      );

      await service.create(makeUser(), SHIPPING_DTO);

      expect(shippingFeeResolverService.resolveShippingCents).toHaveBeenCalledWith(
        ['prod-1'],
        'ZA',
        'NA',
        CurrencyCode.NAD,
        expect.any(Date),
      );
    });

    it('resolves the fee against the same orderCreatedAt instant as the commission-rate snapshot', async () => {
      stageCart([{ productId: 'prod-1', quantity: 1 }], [makeProduct()]);

      await service.create(makeUser(), SHIPPING_DTO);

      const rateAtCalls = commissionRateService.getRateAt.mock.calls as [Date][];
      const resolveCalls = shippingFeeResolverService.resolveShippingCents.mock.calls as [
        string[],
        string,
        string,
        CurrencyCode,
        Date,
      ][];
      expect(resolveCalls[0][4]).toBe(rateAtCalls[0][0]);
    });

    it("writes shippingTotal 0 (today's exact prior behaviour) when the resolver returns 0 cents", async () => {
      shippingFeeResolverService.resolveShippingCents.mockResolvedValue(0);
      stageCart(
        [{ productId: 'prod-1', quantity: 2 }],
        [makeProduct({ price: '185.00' as never })],
      );

      await service.create(makeUser(), SHIPPING_DTO);

      expect(manager.save).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({ shippingTotal: 0, total: 370 }),
      );
    });

    it('fails order creation (never charges 0) when the resolver throws — no order, no payment', async () => {
      shippingFeeResolverService.resolveShippingCents.mockRejectedValue(
        new Error('No shipping fee configured'),
      );
      stageCart([{ productId: 'prod-1', quantity: 1 }], [makeProduct()]);

      await expect(service.create(makeUser(), SHIPPING_DTO)).rejects.toThrow(
        'No shipping fee configured',
      );

      expect(manager.save).not.toHaveBeenCalledWith(Order, expect.anything());
      expect(paymentProvider.initiatePayment).not.toHaveBeenCalled();
    });

    it('resolves the shipping fee exactly once per order, over every product id in the cart', async () => {
      stageCart(
        [
          { productId: 'prod-1', quantity: 1 },
          { productId: 'prod-2', quantity: 1 },
        ],
        [makeProduct({ id: 'prod-1' }), makeProduct({ id: 'prod-2' })],
      );

      await service.create(makeUser(), SHIPPING_DTO);

      expect(shippingFeeResolverService.resolveShippingCents).toHaveBeenCalledTimes(1);
      expect(shippingFeeResolverService.resolveShippingCents).toHaveBeenCalledWith(
        ['prod-1', 'prod-2'],
        'ZA',
        'NA',
        CurrencyCode.ZAR,
        expect.any(Date),
      );
    });

    it('writes shippingTotal/total from the resolved cents (integer-cents → currency conversion)', async () => {
      shippingFeeResolverService.resolveShippingCents.mockResolvedValue(40000); // R400.00
      stageCart(
        [{ productId: 'prod-1', quantity: 1 }],
        [makeProduct({ price: '185.00' as never })],
      );

      await service.create(makeUser(), SHIPPING_DTO);

      expect(manager.save).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({ shippingTotal: 400, total: 585 }), // 185 + 400
      );
    });
  });

  // ── Order creation: stock ──────────────────────────────────────────────────

  describe('create — stock', () => {
    it('locks each product row and decrements stock by the ordered quantity', async () => {
      stageCart([{ productId: 'prod-1', quantity: 4 }], [makeProduct({ stockQuantity: 10 })]);

      await service.create(makeUser(), SHIPPING_DTO);

      expect(manager.findOne).toHaveBeenCalledWith(
        Product,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(manager.update).toHaveBeenCalledWith(Product, 'prod-1', { stockQuantity: 6 });
    });

    it('rejects insufficient stock with 409 and writes nothing after the failure', async () => {
      stageCart(
        [
          { productId: 'prod-a', quantity: 1 },
          { productId: 'prod-b', quantity: 5 },
        ],
        [
          makeProduct({ id: 'prod-a', stockQuantity: 1 }),
          makeProduct({ id: 'prod-b', name: 'Rooibos', stockQuantity: 2 }),
        ],
      );

      await expect(service.create(makeUser(), SHIPPING_DTO)).rejects.toMatchObject({
        constructor: ConflictException,
        message: "Insufficient stock for 'Rooibos' — only 2 left",
      });

      // The throw escapes dataSource.transaction → the DB rolls back every
      // write in the unit of work. No order, no payment, no cart clear.
      expect(manager.save).not.toHaveBeenCalledWith(Order, expect.anything());
      expect(manager.delete).not.toHaveBeenCalled();
      expect(paymentProvider.initiatePayment).not.toHaveBeenCalled();
    });

    it('clears the cart only after a successful order', async () => {
      stageCart([{ productId: 'prod-1', quantity: 1 }], [makeProduct()]);

      await service.create(makeUser(), SHIPPING_DTO);

      expect(manager.delete).toHaveBeenCalledWith(expect.anything(), { cartId: 'cart-1' });
    });
  });

  // ── Order creation: payment via the port ───────────────────────────────────

  describe('create — payment through PAYMENT_PROVIDER port', () => {
    it('initiates payment for the server-computed total (subtotal + shipping fee, SF-3) and confirms the order when paid', async () => {
      stageCart(
        [{ productId: 'prod-1', quantity: 2 }],
        [makeProduct({ price: '185.00' as never })],
      );

      await service.create(makeUser(), SHIPPING_DTO);

      // subtotal 370 + resolved shipping fee 250 (DEFAULT_SHIPPING_FEE) = 620 —
      // the payment amount includes the fee, never just the subtotal.
      expect(paymentProvider.initiatePayment).toHaveBeenCalledWith({
        orderId: 'order-1',
        amount: 620,
        currency: CurrencyCode.ZAR,
      });
      expect(paymentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.PAID, providerRef: 'stub_ref_1' }),
      );
      // pending → confirmed happened through the state machine.
      expect(ordersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.CONFIRMED }),
      );
    });

    it('records a failed payment and leaves the order pending', async () => {
      stageCart([{ productId: 'prod-1', quantity: 1 }], [makeProduct()]);
      paymentProvider.getPaymentStatus.mockResolvedValue('failed');

      await service.create(makeUser(), SHIPPING_DTO);

      expect(paymentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.FAILED }),
      );
      expect(ordersRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── order.paid domain event (TE-4) ─────────────────────────────────────────

  describe('create — order.paid domain event', () => {
    it('emits order.paid exactly once when payment is captured as PAID', async () => {
      stageCart([{ productId: 'prod-1', quantity: 1 }], [makeProduct()]);

      await service.create(makeUser(), SHIPPING_DTO);

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(OrderEvents.PAID, { orderId: 'order-1' });
    });

    it('does not emit order.paid when payment is FAILED', async () => {
      stageCart([{ productId: 'prod-1', quantity: 1 }], [makeProduct()]);
      paymentProvider.getPaymentStatus.mockResolvedValue('failed');

      await service.create(makeUser(), SHIPPING_DTO);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does not emit order.paid when payment is PENDING', async () => {
      stageCart([{ productId: 'prod-1', quantity: 1 }], [makeProduct()]);
      paymentProvider.getPaymentStatus.mockResolvedValue('pending');

      await service.create(makeUser(), SHIPPING_DTO);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  // ── State machine ──────────────────────────────────────────────────────────

  describe('updateStatus — state machine', () => {
    const admin = makeUser({ id: 'admin-1', role: UserRole.ADMIN });

    function stageOrder(overrides: Partial<Order> = {}) {
      const order = makeOrder(overrides);
      ordersRepo.findOne.mockResolvedValue(order);
      return order;
    }

    it.each([
      [OrderStatus.PENDING, OrderStatus.CONFIRMED],
      [OrderStatus.PENDING, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
      [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING, OrderStatus.HANDED_TO_HB],
      [OrderStatus.HANDED_TO_HB, OrderStatus.SHIPPED],
      [OrderStatus.SHIPPED, OrderStatus.DELIVERED],
    ])('admin can move %s → %s', async (from, to) => {
      stageOrder({ status: from });

      const dto = await service.updateStatus(admin, 'order-1', to);

      expect(dto.status).toBe(to);
      expect(ordersRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: to }));
    });

    it.each([
      [OrderStatus.PENDING, OrderStatus.SHIPPED],
      [OrderStatus.PROCESSING, OrderStatus.CANCELLED], // cancellation after processing is TBD
      [OrderStatus.DELIVERED, OrderStatus.PENDING],
      [OrderStatus.CANCELLED, OrderStatus.CONFIRMED],
      [OrderStatus.SHIPPED, OrderStatus.HANDED_TO_HB], // no going backwards
    ])('rejects invalid transition %s → %s with 409 and a clear message', async (from, to) => {
      stageOrder({ status: from });

      await expect(service.updateStatus(admin, 'order-1', to)).rejects.toMatchObject({
        constructor: ConflictException,
        message: `Cannot change order status from '${from}' to '${to}'`,
      });
      expect(ordersRepo.save).not.toHaveBeenCalled();
    });

    it('404s an unknown order', async () => {
      ordersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus(admin, 'nope', OrderStatus.CONFIRMED),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('exports a transition map that matches the vault state machine', () => {
      expect(ORDER_STATUS_TRANSITIONS[OrderStatus.PROCESSING]).toEqual([OrderStatus.HANDED_TO_HB]);
      expect(ORDER_STATUS_TRANSITIONS[OrderStatus.DELIVERED]).toEqual([]);
      expect(ORDER_STATUS_TRANSITIONS[OrderStatus.CANCELLED]).toEqual([]);
    });
  });

  // ── deliveredAt stamping (VE-3: Vendor Earnings & Commission) ──────────────

  describe('updateStatus — deliveredAt stamping', () => {
    const admin = makeUser({ id: 'admin-1', role: UserRole.ADMIN });

    it('stamps deliveredAt to approximately now on shipped → delivered', async () => {
      stageOrder({ status: OrderStatus.SHIPPED, deliveredAt: undefined });
      const before = Date.now();

      await service.updateStatus(admin, 'order-1', OrderStatus.DELIVERED);

      const saved = lastSavedOrder();
      expect(saved.deliveredAt).toBeInstanceOf(Date);
      expect(saved.deliveredAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(saved.deliveredAt.getTime()).toBeLessThanOrEqual(Date.now());

      function stageOrder(overrides: Partial<Order> = {}) {
        const order = makeOrder(overrides);
        ordersRepo.findOne.mockResolvedValue(order);
        return order;
      }
    });

    it('never overwrites an existing non-null deliveredAt', async () => {
      const existing = new Date('2026-01-01T00:00:00.000Z');
      const order = makeOrder({ status: OrderStatus.SHIPPED, deliveredAt: existing });
      ordersRepo.findOne.mockResolvedValue(order);

      await service.updateStatus(admin, 'order-1', OrderStatus.DELIVERED);

      expect(lastSavedOrder().deliveredAt).toBe(existing);
      expect(ordersRepo.update).not.toHaveBeenCalled();
    });

    it('stamps deliveredAt via a race-safe conditional UPDATE ... WHERE deliveredAt IS NULL, not the whole-entity save()', async () => {
      const order = makeOrder({ status: OrderStatus.SHIPPED, deliveredAt: undefined });
      ordersRepo.findOne.mockResolvedValue(order);
      const before = Date.now();

      await service.updateStatus(admin, 'order-1', OrderStatus.DELIVERED);

      expect(ordersRepo.update).toHaveBeenCalledTimes(1);
      const calls = ordersRepo.update.mock.calls as [
        { id: string; deliveredAt: unknown },
        { deliveredAt: Date },
      ][];
      const [where, patch] = calls[0];
      expect(where).toEqual({ id: 'order-1', deliveredAt: IsNull() });
      expect(patch.deliveredAt).toBeInstanceOf(Date);
      expect(patch.deliveredAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(patch.deliveredAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it.each([
      [OrderStatus.PENDING, OrderStatus.CONFIRMED],
      [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
      [OrderStatus.PROCESSING, OrderStatus.HANDED_TO_HB],
      [OrderStatus.HANDED_TO_HB, OrderStatus.SHIPPED],
    ])('leaves deliveredAt untouched on %s → %s', async (from, to) => {
      const order = makeOrder({ status: from, deliveredAt: undefined });
      ordersRepo.findOne.mockResolvedValue(order);

      await service.updateStatus(admin, 'order-1', to);

      expect(lastSavedOrder().deliveredAt).toBeUndefined();
    });

    function lastSavedOrder(): Order {
      const calls = ordersRepo.save.mock.calls as Order[][];
      return calls[calls.length - 1][0];
    }
  });

  // ── Admin override (any-state, reason required, audit log) ────────────────

  describe('overrideStatus — admin any-state override', () => {
    const admin = makeUser({ id: 'admin-1', role: UserRole.ADMIN });

    function stageOrder(overrides: Partial<Order> = {}) {
      const order = makeOrder(overrides);
      ordersRepo.findOne.mockResolvedValue(order);
      return order;
    }

    /** The order write goes through `manager.save(Order, ...)` inside the transaction. */
    function lastManagerSavedOrder(): Order {
      const orderCalls = (manager.save.mock.calls as [unknown, Order][]).filter(
        ([entity]) => entity === Order,
      );
      return orderCalls[orderCalls.length - 1][1];
    }

    /** The audit row goes through `manager.save(OrderStatusOverride, ...)`. */
    function lastManagerSavedOverride(): Partial<OrderStatusOverride> {
      const overrideCalls = (
        manager.save.mock.calls as [unknown, Partial<OrderStatusOverride>][]
      ).filter(([entity]) => entity === OrderStatusOverride);
      return overrideCalls[overrideCalls.length - 1][1];
    }

    it.each([
      [OrderStatus.DELIVERED, OrderStatus.PENDING],
      [OrderStatus.CANCELLED, OrderStatus.CONFIRMED],
      [OrderStatus.PENDING, OrderStatus.SHIPPED],
      [OrderStatus.SHIPPED, OrderStatus.HANDED_TO_HB],
    ])(
      'writes any-status-to-any-status %s → %s, bypassing ORDER_STATUS_TRANSITIONS',
      async (from, to) => {
        stageOrder({ status: from });

        const dto = await service.overrideStatus(admin, 'order-1', {
          status: to,
          reason: 'Support ticket #123 — customer confirmed receipt',
          sendNotifications: false,
        });

        expect(dto.status).toBe(to);
        expect(lastManagerSavedOrder()).toEqual(expect.objectContaining({ status: to }));
      },
    );

    it('404s an unknown order', async () => {
      ordersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.overrideStatus(admin, 'nope', {
          status: OrderStatus.CONFIRMED,
          reason: 'test',
          sendNotifications: false,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a no-op override (status unchanged) with 409 — no write, no audit row, no event', async () => {
      stageOrder({ status: OrderStatus.CONFIRMED });

      await expect(
        service.overrideStatus(admin, 'order-1', {
          status: OrderStatus.CONFIRMED,
          reason: 'Accidentally hit override without changing the status',
          sendNotifications: true,
        }),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        message: 'Order is already in this status',
      });

      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('emits order.paid when sendNotifications is true and target is CONFIRMED', async () => {
      stageOrder({ status: OrderStatus.PENDING });

      await service.overrideStatus(admin, 'order-1', {
        status: OrderStatus.CONFIRMED,
        reason: 'Manual payment reconciliation',
        sendNotifications: true,
      });

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(OrderEvents.PAID, { orderId: 'order-1' });
    });

    it('does not emit order.paid when sendNotifications is false, even for CONFIRMED', async () => {
      stageOrder({ status: OrderStatus.PENDING });

      await service.overrideStatus(admin, 'order-1', {
        status: OrderStatus.CONFIRMED,
        reason: 'Manual correction, no customer email wanted',
        sendNotifications: false,
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does not emit order.paid when sendNotifications is true but target is not CONFIRMED', async () => {
      stageOrder({ status: OrderStatus.SHIPPED });

      await service.overrideStatus(admin, 'order-1', {
        status: OrderStatus.DELIVERED,
        reason: 'Marking delivered per courier confirmation',
        sendNotifications: true,
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('writes the status change and the audit row in the same transaction, with the correct shape', async () => {
      stageOrder({ status: OrderStatus.SHIPPED });

      await service.overrideStatus(admin, 'order-1', {
        status: OrderStatus.DELIVERED,
        reason: 'Courier confirmed drop-off, system missed the webhook',
        sendNotifications: true,
      });

      expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1);
      expect(lastManagerSavedOverride()).toEqual({
        orderId: 'order-1',
        adminUserId: 'admin-1',
        fromStatus: OrderStatus.SHIPPED,
        toStatus: OrderStatus.DELIVERED,
        reason: 'Courier confirmed drop-off, system missed the webhook',
        sendNotifications: true,
      });
    });

    it('writes the audit row even when sendNotifications is false', async () => {
      stageOrder({ status: OrderStatus.PENDING });

      await service.overrideStatus(admin, 'order-1', {
        status: OrderStatus.CANCELLED,
        reason: 'Duplicate order, cancelling silently',
        sendNotifications: false,
      });

      expect(lastManagerSavedOverride()).toEqual(
        expect.objectContaining({ sendNotifications: false }),
      );
    });

    it('stamps deliveredAt via the same race-safe conditional UPDATE when the target is DELIVERED', async () => {
      stageOrder({ status: OrderStatus.SHIPPED, deliveredAt: undefined });
      const before = Date.now();

      await service.overrideStatus(admin, 'order-1', {
        status: OrderStatus.DELIVERED,
        reason: 'Manual delivery confirmation',
        sendNotifications: false,
      });

      expect(manager.update).toHaveBeenCalledTimes(1);
      const [entity, where, patch] = manager.update.mock.calls[0] as [
        unknown,
        { id: string; deliveredAt: unknown },
        { deliveredAt: Date },
      ];
      expect(entity).toBe(Order);
      expect(where).toEqual({ id: 'order-1', deliveredAt: IsNull() });
      expect(patch.deliveredAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('does not clear an existing deliveredAt when overriding out of delivered', async () => {
      const existing = new Date('2026-01-01T00:00:00.000Z');
      stageOrder({ status: OrderStatus.DELIVERED, deliveredAt: existing });

      await service.overrideStatus(admin, 'order-1', {
        status: OrderStatus.PENDING,
        reason: 'Reopening for a warranty claim',
        sendNotifications: false,
      });

      expect(lastManagerSavedOrder().deliveredAt).toBe(existing);
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('findOverridesForOrder', () => {
    function stageQueryBuilder(
      entities: OrderStatusOverride[],
      raw: { adminEmail: string | null }[],
    ) {
      const qb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawAndEntities: jest.fn(() => Promise.resolve({ entities, raw })),
      };
      orderStatusOverridesRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    }

    it('404s when the order does not exist', async () => {
      ordersRepo.findOne.mockResolvedValue(null);

      await expect(service.findOverridesForOrder('nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(orderStatusOverridesRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('maps override rows to the shared DTO shape, newest first, joining the admin email', async () => {
      ordersRepo.findOne.mockResolvedValue(makeOrder());
      const override = {
        id: 'override-2',
        orderId: 'order-1',
        adminUserId: 'admin-1',
        fromStatus: OrderStatus.SHIPPED,
        toStatus: OrderStatus.DELIVERED,
        reason: 'Manual delivery confirmation',
        sendNotifications: false,
        createdAt: NOW,
      } as OrderStatusOverride;
      const qb = stageQueryBuilder([override], [{ adminEmail: 'admin@hb.com' }]);

      const result = await service.findOverridesForOrder('order-1');

      expect(qb.where).toHaveBeenCalledWith('override.orderId = :orderId', { orderId: 'order-1' });
      expect(qb.orderBy).toHaveBeenCalledWith('override.createdAt', 'DESC');
      expect(result).toEqual([
        {
          id: 'override-2',
          orderId: 'order-1',
          adminUserId: 'admin-1',
          adminEmail: 'admin@hb.com',
          fromStatus: OrderStatus.SHIPPED,
          toStatus: OrderStatus.DELIVERED,
          reason: 'Manual delivery confirmation',
          sendNotifications: false,
          createdAt: NOW.toISOString(),
        },
      ]);
    });

    it('leaves adminEmail undefined when the join finds no matching user', async () => {
      ordersRepo.findOne.mockResolvedValue(makeOrder());
      const override = {
        id: 'override-3',
        orderId: 'order-1',
        adminUserId: 'admin-1',
        fromStatus: OrderStatus.PENDING,
        toStatus: OrderStatus.CANCELLED,
        reason: 'test',
        sendNotifications: false,
        createdAt: NOW,
      } as OrderStatusOverride;
      stageQueryBuilder([override], [{ adminEmail: null }]);

      const result = await service.findOverridesForOrder('order-1');

      expect(result[0].adminEmail).toBeUndefined();
    });

    it('returns an empty array when the order has no overrides', async () => {
      ordersRepo.findOne.mockResolvedValue(makeOrder());
      stageQueryBuilder([], []);

      const result = await service.findOverridesForOrder('order-1');

      expect(result).toEqual([]);
    });
  });

  // ── Transition rights per role ─────────────────────────────────────────────

  describe('updateStatus — actor rights', () => {
    const vendorUser = makeUser({ id: 'vendor-user-1', role: UserRole.VENDOR });

    it('vendor can move confirmed → processing on an order holding their lines', async () => {
      vendorsRepo.findOne.mockResolvedValue({ id: 'vendor-1', userId: 'vendor-user-1' });
      ordersRepo.findOne.mockResolvedValue(
        makeOrder({
          status: OrderStatus.CONFIRMED,
          items: [makeOrderItem({ vendorId: 'vendor-1' })],
        }),
      );

      const dto = await service.updateStatus(vendorUser, 'order-1', OrderStatus.PROCESSING);

      expect(dto.status).toBe(OrderStatus.PROCESSING);
    });

    it('vendor can move processing → handed_to_hb on their own lines', async () => {
      vendorsRepo.findOne.mockResolvedValue({ id: 'vendor-1', userId: 'vendor-user-1' });
      ordersRepo.findOne.mockResolvedValue(
        makeOrder({
          status: OrderStatus.PROCESSING,
          items: [makeOrderItem({ vendorId: 'vendor-1' })],
        }),
      );

      const dto = await service.updateStatus(vendorUser, 'order-1', OrderStatus.HANDED_TO_HB);

      expect(dto.status).toBe(OrderStatus.HANDED_TO_HB);
    });

    it('vendor cannot ship or cancel (admin-only targets) — 403', async () => {
      ordersRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.HANDED_TO_HB }));

      await expect(
        service.updateStatus(vendorUser, 'order-1', OrderStatus.SHIPPED),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('vendor gets 404 for an order without any of their lines (no existence leak)', async () => {
      vendorsRepo.findOne.mockResolvedValue({ id: 'vendor-1', userId: 'vendor-user-1' });
      ordersRepo.findOne.mockResolvedValue(
        makeOrder({
          status: OrderStatus.CONFIRMED,
          items: [makeOrderItem({ vendorId: 'other-vendor' })],
        }),
      );

      await expect(
        service.updateStatus(vendorUser, 'order-1', OrderStatus.PROCESSING),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(ordersRepo.save).not.toHaveBeenCalled();
    });

    it('customer can cancel their own pending order', async () => {
      const customer = makeUser();
      ordersRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PENDING }));

      const dto = await service.updateStatus(customer, 'order-1', OrderStatus.CANCELLED);

      expect(dto.status).toBe(OrderStatus.CANCELLED);
    });

    it("customer cannot cancel someone else's order — 404, no leak", async () => {
      const intruder = makeUser({ id: 'someone-else' });
      ordersRepo.findOne.mockResolvedValue(makeOrder({ userId: 'user-1' }));

      await expect(
        service.updateStatus(intruder, 'order-1', OrderStatus.CANCELLED),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('customer cannot perform non-cancel transitions — 403', async () => {
      const customer = makeUser();
      ordersRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PENDING }));

      await expect(
        service.updateStatus(customer, 'order-1', OrderStatus.CONFIRMED),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('customer cannot cancel after processing has started (from-state rule)', async () => {
      const customer = makeUser();
      ordersRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PROCESSING }));

      await expect(
        service.updateStatus(customer, 'order-1', OrderStatus.CANCELLED),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ── Reads ──────────────────────────────────────────────────────────────────

  describe('findOneForUser', () => {
    it("scopes non-admin reads to the caller's own orders", async () => {
      ordersRepo.findOne.mockResolvedValue(null);

      await expect(service.findOneForUser(makeUser(), 'order-9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(ordersRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-9', userId: 'user-1' } }),
      );
    });

    it('lets an admin read any order', async () => {
      ordersRepo.findOne.mockResolvedValue(makeOrder());

      await service.findOneForUser(makeUser({ id: 'admin-1', role: UserRole.ADMIN }), 'order-1');

      expect(ordersRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1' } }),
      );
    });
  });

  describe('findAllForVendor', () => {
    it("returns only order lines belonging to the caller's vendor", async () => {
      vendorsRepo.findOne.mockResolvedValue({ id: 'vendor-1', userId: 'vendor-user-1' });
      const line = makeOrderItem({
        vendorId: 'vendor-1',
        order: makeOrder({ status: OrderStatus.CONFIRMED }),
      });
      orderItemsRepo.find.mockResolvedValue([line]);

      const result = await service.findAllForVendor('vendor-user-1');

      expect(orderItemsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { vendorId: 'vendor-1' } }),
      );
      expect(result).toHaveLength(1);
    });

    it('404s when the caller has no vendor row', async () => {
      vendorsRepo.findOne.mockResolvedValue(null);

      await expect(service.findAllForVendor('not-a-vendor')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(orderItemsRepo.find).not.toHaveBeenCalled();
    });

    it('returns an empty array when the vendor has no order lines yet', async () => {
      vendorsRepo.findOne.mockResolvedValue({ id: 'vendor-1', userId: 'vendor-user-1' });
      orderItemsRepo.find.mockResolvedValue([]);

      const result = await service.findAllForVendor('vendor-user-1');

      expect(result).toEqual([]);
    });

    it('maps the DTO shape correctly', async () => {
      vendorsRepo.findOne.mockResolvedValue({ id: 'vendor-1', userId: 'vendor-user-1' });
      const order = makeOrder({ id: 'order-7', status: OrderStatus.PROCESSING });
      const line = makeOrderItem({
        id: 'line-7',
        orderId: 'order-7',
        vendorId: 'vendor-1',
        productName: 'Kalahari Salt',
        unitPrice: '42.50' as never,
        currency: CurrencyCode.ZAR,
        quantity: 3,
        order,
      });
      orderItemsRepo.find.mockResolvedValue([line]);

      const result = await service.findAllForVendor('vendor-user-1');

      expect(result[0]).toEqual({
        id: 'line-7',
        orderId: 'order-7',
        orderStatus: OrderStatus.PROCESSING,
        orderCreatedAt: NOW.toISOString(),
        productName: 'Kalahari Salt',
        unitPrice: 42.5,
        currency: CurrencyCode.ZAR,
        quantity: 3,
      });
    });
  });
});
