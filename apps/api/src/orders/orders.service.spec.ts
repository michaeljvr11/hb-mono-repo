import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CurrencyCode, ListingType, OrderStatus, PaymentStatus, UserRole } from '@hb/shared';
import { ORDER_STATUS_TRANSITIONS, OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Cart } from '../cart/entities/cart.entity';
import { Product } from '../products/entities/product.entity';
import { Address } from '../addresses/entities/address.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { User } from '../users/entities/user.entity';
import { PAYMENT_PROVIDER } from '../payments/payment-provider.port';
import { CreateOrderDto } from './dto/create-order.dto';

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

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepo: Record<string, jest.Mock>;
  let paymentsRepo: Record<string, jest.Mock>;
  let vendorsRepo: Record<string, jest.Mock>;
  let paymentProvider: Record<string, jest.Mock>;
  let manager: Record<string, jest.Mock>;

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
    };
    paymentsRepo = {
      create: jest.fn((p: Partial<Payment>) => p as Payment),
      save: jest.fn((p: Payment) => Promise.resolve(p)),
    };
    vendorsRepo = { findOne: jest.fn() };
    paymentProvider = {
      initiatePayment: jest.fn(() =>
        Promise.resolve({ provider: 'stub', providerRef: 'stub_ref_1' }),
      ),
      getPaymentStatus: jest.fn(() => Promise.resolve('paid')),
      refund: jest.fn(),
    };

    const dataSource = {
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
        { provide: PAYMENT_PROVIDER, useValue: paymentProvider },
        { provide: DataSource, useValue: dataSource },
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

      // 3 × 19.99 + 0.10 = 60.07 — exact, no float drift.
      expect(manager.save).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({
          subtotal: 60.07,
          shippingTotal: 0,
          total: 60.07,
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
    it('initiates payment for the server-computed total and confirms the order when paid', async () => {
      stageCart(
        [{ productId: 'prod-1', quantity: 2 }],
        [makeProduct({ price: '185.00' as never })],
      );

      await service.create(makeUser(), SHIPPING_DTO);

      expect(paymentProvider.initiatePayment).toHaveBeenCalledWith({
        orderId: 'order-1',
        amount: 370,
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
});
