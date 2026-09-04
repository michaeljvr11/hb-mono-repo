import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CurrencyCode, ListingType, OrderStatus, UserRole } from '@hb/shared';
import { ShippingFeeResolverService } from './shipping-fee-resolver.service';
import { ShippingFeeService } from './shipping-fee.service';
import { ProductShippingFeeOverrideService } from './product-shipping-fee-override.service';
import { CartOriginResolverService } from './cart-origin-resolver.service';
import { CurrentShippingFeeController } from './current-shipping-fee.controller';
import { GetCurrentShippingFeeQueryDto } from './dto/get-current-shipping-fee-query.dto';
import { OrdersService } from '../orders/orders.service';
import { CreateOrderDto } from '../orders/dto/create-order.dto';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OrderStatusOverride } from '../orders/entities/order-status-override.entity';
import { Cart } from '../cart/entities/cart.entity';
import { Product } from '../products/entities/product.entity';
import { Address } from '../addresses/entities/address.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { User } from '../users/entities/user.entity';
import { PAYMENT_PROVIDER } from '../payments/payment-provider.port';
import { CommissionRateService } from '../commission/commission-rate.service';

/**
 * FAIL 1 (code review): the checkout preview (`GET /shipping-fee/current`)
 * must resolve the exact fee `OrdersService.create` will charge for the same
 * cart. Both `orders.service.spec.ts` and `current-shipping-fee.controller.spec.ts`
 * assert each call site passes the right arguments to the shared
 * `ShippingFeeResolverService.resolveShippingCents` in isolation (mocked).
 * This suite is the one place that runs BOTH real call sites — through one
 * shared, un-mocked `ShippingFeeResolverService` instance, only mocking the
 * DB/provider boundary — over the identical cart, and asserts the two
 * outputs agree with each other, not with a stub.
 */
describe('checkout preview vs order-creation shipping-fee parity', () => {
  const NOW = new Date('2026-07-07T09:00:00.000Z');
  const userId = 'user-1';

  const shippingAddress = {
    recipientName: 'Johannes Shipanga',
    line1: '12 Independence Ave',
    city: 'Windhoek',
    region: 'Khomas',
    countryCode: 'NA' as const,
  };
  const createOrderDto: CreateOrderDto = { shippingAddress };

  function makeProduct(overrides: Partial<Product>): Product {
    return {
      currency: CurrencyCode.ZAR,
      stockQuantity: 10,
      originCountry: 'ZA',
      listingType: ListingType.PLATFORM,
      vendorId: undefined,
      ...overrides,
    } as Product;
  }

  const products = new Map<string, Product>([
    ['prod-1', makeProduct({ id: 'prod-1', name: 'Fynbos Honey', price: '1000.00' as never })],
    [
      'prod-overridden',
      makeProduct({ id: 'prod-overridden', name: 'Rooibos', price: '10.00' as never }),
    ],
  ]);
  const cartLines = [
    { productId: 'prod-1', quantity: 1 },
    { productId: 'prod-overridden', quantity: 1 },
  ];

  /** One real resolver, backed by mocked default-fee/override lookups — the single source of truth both paths below call. */
  function buildResolver(overrideAmount: number | undefined) {
    const shippingFeeService = {
      getFeeAt: jest.fn().mockResolvedValue({
        id: 'fee-za-na-zar',
        amount: 150,
        currency: CurrencyCode.ZAR,
        originCountry: 'ZA',
        destinationCountry: 'NA',
        effectiveFrom: NOW.toISOString(),
        createdAt: NOW.toISOString(),
      }),
    };
    const overrideService = {
      findOverrideAmounts: jest
        .fn()
        .mockResolvedValue(
          overrideAmount === undefined ? new Map() : new Map([['prod-overridden', overrideAmount]]),
        ),
    };
    return new ShippingFeeResolverService(
      shippingFeeService as unknown as ShippingFeeService,
      overrideService as unknown as ProductShippingFeeOverrideService,
    );
  }

  async function previewFor(resolver: ShippingFeeResolverService): Promise<number> {
    const cartRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'cart-1',
        userId,
        items: cartLines.map((line, idx) => ({
          id: `ci-${idx}`,
          cartId: 'cart-1',
          productId: line.productId,
          product: products.get(line.productId),
        })),
      }),
    };
    const cartOriginResolver = new CartOriginResolverService(
      cartRepo as unknown as Repository<Cart>,
    );
    const controller = new CurrentShippingFeeController(resolver, cartOriginResolver);

    const query: GetCurrentShippingFeeQueryDto = {
      destinationCountry: 'NA',
      currency: CurrencyCode.ZAR,
    };
    const result = await controller.current(query, { id: userId } as User);
    return Math.round(result.amount * 100);
  }

  async function chargeFor(resolver: ShippingFeeResolverService): Promise<number> {
    const manager: Record<string, jest.Mock> = {
      findOne: jest.fn((entity: unknown, options: { where?: { id?: string } }) => {
        if (entity === Cart) {
          return Promise.resolve({
            id: 'cart-1',
            userId,
            items: cartLines.map((line, idx) => ({
              id: `ci-${idx}`,
              cartId: 'cart-1',
              productId: line.productId,
              quantity: line.quantity,
            })),
          });
        }
        if (entity === Product) {
          return Promise.resolve(products.get(options.where?.id ?? '') ?? null);
        }
        return Promise.resolve(null);
      }),
      save: jest.fn((entity: unknown, value: Record<string, unknown>) => {
        if (entity === Address) return Promise.resolve({ ...value, id: 'addr-1' });
        if (entity === Order) {
          const saved = { ...value, id: 'order-1', createdAt: NOW, updatedAt: NOW };
          savedOrder = saved;
          return Promise.resolve(saved);
        }
        return Promise.resolve(value);
      }),
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
      // Every cart line in this harness is unsized (no productSizeId) and no
      // product here has any ProductSize rows — the deleted-size guard in
      // OrdersService.create must never fire for this parity fixture.
      count: jest.fn(() => Promise.resolve(0)),
    };

    // findOneForUser (called at the end of OrdersService.create) re-reads
    // via ordersRepo.findOne — echo back whatever manager.save actually
    // wrote for shippingTotal/total, not a canned value, so this harness
    // proves the REAL computed charge, not a fixture.
    let savedOrder: Record<string, unknown> = {};
    const ordersRepo = {
      findOne: jest.fn(() =>
        Promise.resolve({
          status: OrderStatus.CONFIRMED,
          items: [],
          ...savedOrder,
        }),
      ),
      save: jest.fn((o: unknown) => Promise.resolve(o)),
      find: jest.fn(),
      update: jest.fn(() => Promise.resolve({ affected: 1 })),
    };
    const paymentsRepo = {
      create: jest.fn((p: Record<string, unknown>) => p),
      save: jest.fn((p: unknown) => Promise.resolve(p)),
    };
    const paymentProvider = {
      initiatePayment: jest.fn(() =>
        Promise.resolve({ provider: 'stub', providerRef: 'stub_ref_1' }),
      ),
      getPaymentStatus: jest.fn(() => Promise.resolve('paid')),
      refund: jest.fn(),
    };
    const commissionRateService = {
      getRateAt: jest.fn(() =>
        Promise.resolve({
          id: 'rate-1',
          ratePercent: 15,
          effectiveFrom: NOW.toISOString(),
          createdAt: NOW.toISOString(),
        }),
      ),
    };
    const dataSourceMock = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager as unknown as EntityManager),
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: ordersRepo },
        { provide: getRepositoryToken(Payment), useValue: paymentsRepo },
        { provide: getRepositoryToken(Vendor), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(OrderItem), useValue: { find: jest.fn() } },
        {
          provide: getRepositoryToken(OrderStatusOverride),
          useValue: { createQueryBuilder: jest.fn() },
        },
        { provide: PAYMENT_PROVIDER, useValue: paymentProvider },
        { provide: DataSource, useValue: dataSourceMock },
        { provide: CommissionRateService, useValue: commissionRateService },
        { provide: ShippingFeeResolverService, useValue: resolver },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    const ordersService = module.get(OrdersService);
    const user = {
      id: userId,
      email: 'customer@hb.com',
      role: UserRole.CUSTOMER,
      isActive: true,
      isVerified: true,
    } as User;

    const order = await ordersService.create(user, createOrderDto);
    return Math.round(order.shippingTotal * 100);
  }

  it('agree when the cart has no override anywhere (both resolve the default)', async () => {
    const resolver = buildResolver(undefined);

    const previewCents = await previewFor(resolver);
    const chargeCents = await chargeFor(resolver);

    expect(previewCents).toBe(chargeCents);
    expect(previewCents).toBe(15000); // R150.00 default
  });

  it('agree when a cart line has an override HIGHER than the default — the exact FAIL 1 scenario', async () => {
    const resolver = buildResolver(400);

    const previewCents = await previewFor(resolver);
    const chargeCents = await chargeFor(resolver);

    expect(previewCents).toBe(chargeCents);
    expect(previewCents).toBe(40000); // R400.00 override wins the MAX
  });

  it('agree when a cart line has an override LOWER than the default (default still wins)', async () => {
    const resolver = buildResolver(50);

    const previewCents = await previewFor(resolver);
    const chargeCents = await chargeFor(resolver);

    expect(previewCents).toBe(chargeCents);
    expect(previewCents).toBe(15000); // R150.00 default still wins the MAX
  });
});
