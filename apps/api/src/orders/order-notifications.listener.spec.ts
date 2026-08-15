import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CurrencyCode, ListingType, OrderStatus } from '@hb/shared';
import { OrderNotificationsListener } from './order-notifications.listener';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { VendorsService } from '../vendors/vendors.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { MailService } from '../mail/mail.service';

const NOW = new Date('2026-07-07T09:00:00.000Z');

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
    vendor: { id: 'vendor-1', businessName: 'Honey Co' } as never,
    createdAt: NOW,
    ...overrides,
  } as OrderItem;
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    userId: 'user-1',
    status: OrderStatus.CONFIRMED,
    currency: CurrencyCode.ZAR,
    subtotal: 370,
    shippingTotal: 0,
    total: '370.00' as never,
    originCountry: 'ZA',
    destinationCountry: 'NA',
    items: [],
    user: { id: 'user-1', email: 'customer@hb.com', firstName: 'Casey' } as never,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('OrderNotificationsListener', () => {
  let listener: OrderNotificationsListener;
  let orderRepo: Record<string, jest.Mock>;
  let vendorsService: Record<string, jest.Mock>;
  let platformSettingsService: Record<string, jest.Mock>;
  let mailService: Record<string, jest.Mock>;

  beforeEach(async () => {
    orderRepo = { findOne: jest.fn() };
    vendorsService = { resolveNotificationEmail: jest.fn().mockResolvedValue('vendor@hb.com') };
    platformSettingsService = {
      get: jest.fn().mockResolvedValue({ notificationEmails: ['ops@hb.com'] }),
    };
    mailService = {
      sendVendorOrderNotification: jest.fn().mockResolvedValue(undefined),
      sendPlatformOrderNotification: jest.fn().mockResolvedValue(undefined),
      sendCustomerOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        OrderNotificationsListener,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: VendorsService, useValue: vendorsService },
        { provide: PlatformSettingsService, useValue: platformSettingsService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    listener = module.get(OrderNotificationsListener);
  });

  it('does nothing (no throw) when the order was deleted before processing', async () => {
    orderRepo.findOne.mockResolvedValue(null);

    await expect(listener.handleOrderPaid({ orderId: 'gone' })).resolves.toBeUndefined();
    expect(mailService.sendVendorOrderNotification).not.toHaveBeenCalled();
    expect(mailService.sendPlatformOrderNotification).not.toHaveBeenCalled();
    expect(mailService.sendCustomerOrderConfirmation).not.toHaveBeenCalled();
  });

  it('sends one vendor email + one platform email + one customer email for a single-vendor order', async () => {
    const order = makeOrder({ items: [makeOrderItem()] });
    orderRepo.findOne.mockResolvedValue(order);

    await listener.handleOrderPaid({ orderId: order.id });

    expect(mailService.sendVendorOrderNotification).toHaveBeenCalledTimes(1);
    expect(mailService.sendPlatformOrderNotification).toHaveBeenCalledTimes(1);
    expect(mailService.sendCustomerOrderConfirmation).toHaveBeenCalledTimes(1);
  });

  it("groups lines per vendor: each vendor email contains only that vendor's lines, never the total", async () => {
    const items = [
      makeOrderItem({
        id: 'line-a',
        vendorId: 'vendor-a',
        productName: 'Kalahari Salt',
        vendor: { id: 'vendor-a', businessName: 'Salt Co' } as never,
      }),
      makeOrderItem({
        id: 'line-b',
        vendorId: 'vendor-b',
        productName: 'Rooibos Tea',
        vendor: { id: 'vendor-b', businessName: 'Tea Co' } as never,
      }),
    ];
    const order = makeOrder({ items });
    orderRepo.findOne.mockResolvedValue(order);
    vendorsService.resolveNotificationEmail.mockImplementation((vendorId: string) =>
      Promise.resolve(`${vendorId}@hb.com`),
    );

    await listener.handleOrderPaid({ orderId: order.id });

    expect(mailService.sendVendorOrderNotification).toHaveBeenCalledTimes(2);
    const calls = mailService.sendVendorOrderNotification.mock.calls as unknown as [
      string,
      string,
      string,
      { productName: string }[],
    ][];

    const aCall = calls.find(([to]) => to === 'vendor-a@hb.com');
    expect(aCall[3]).toEqual([expect.objectContaining({ productName: 'Kalahari Salt' })]);
    expect(aCall[3]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ productName: 'Rooibos Tea' })]),
    );
    // No order-total figure is passed to the vendor email at all — the
    // signature has no total parameter, so this is enforced structurally.
    expect(aCall).toHaveLength(4);

    const bCall = calls.find(([to]) => to === 'vendor-b@hb.com');
    expect(bCall[3]).toEqual([expect.objectContaining({ productName: 'Rooibos Tea' })]);
  });

  it('multi-vendor order dispatches N vendor emails + exactly 1 platform email + exactly 1 customer email', async () => {
    const items = [
      makeOrderItem({ id: 'line-a', vendorId: 'vendor-a' }),
      makeOrderItem({ id: 'line-b', vendorId: 'vendor-b' }),
      makeOrderItem({ id: 'line-c', vendorId: 'vendor-a' }),
    ];
    const order = makeOrder({ items });
    orderRepo.findOne.mockResolvedValue(order);

    await listener.handleOrderPaid({ orderId: order.id });

    // Two distinct vendors (a, b) → two vendor emails, not three (one per line).
    expect(mailService.sendVendorOrderNotification).toHaveBeenCalledTimes(2);
    expect(mailService.sendPlatformOrderNotification).toHaveBeenCalledTimes(1);
    expect(mailService.sendCustomerOrderConfirmation).toHaveBeenCalledTimes(1);
  });

  it('gives the customer email every line across every vendor (unlike a vendor email, which is scoped)', async () => {
    const items = [
      makeOrderItem({
        id: 'line-a',
        vendorId: 'vendor-a',
        productName: 'Kalahari Salt',
        vendor: { id: 'vendor-a', businessName: 'Salt Co' } as never,
      }),
      makeOrderItem({
        id: 'line-b',
        vendorId: 'vendor-b',
        productName: 'Rooibos Tea',
        vendor: { id: 'vendor-b', businessName: 'Tea Co' } as never,
      }),
    ];
    const order = makeOrder({ items });
    orderRepo.findOne.mockResolvedValue(order);

    await listener.handleOrderPaid({ orderId: order.id });

    expect(mailService.sendCustomerOrderConfirmation).toHaveBeenCalledTimes(1);
    const calls = mailService.sendCustomerOrderConfirmation.mock.calls as unknown as [
      string,
      string,
      string,
      { productName: string }[],
      number,
      string,
    ][];
    const [to, , orderId, lines, total, currency] = calls[0];
    expect(to).toBe('customer@hb.com');
    expect(orderId).toBe(order.id);
    expect(lines).toEqual([
      expect.objectContaining({ productName: 'Kalahari Salt' }),
      expect.objectContaining({ productName: 'Rooibos Tea' }),
    ]);
    expect(total).toBe(370);
    expect(currency).toBe(CurrencyCode.ZAR);
  });

  it('platform-only order (no vendorId lines) sends 0 vendor emails + 1 platform email', async () => {
    const items = [makeOrderItem({ vendorId: undefined, vendor: undefined })];
    const order = makeOrder({ items });
    orderRepo.findOne.mockResolvedValue(order);

    await listener.handleOrderPaid({ orderId: order.id });

    expect(mailService.sendVendorOrderNotification).not.toHaveBeenCalled();
    expect(mailService.sendPlatformOrderNotification).toHaveBeenCalledTimes(1);
  });

  it('sends the platform email to every configured recipient in one dispatch', async () => {
    platformSettingsService.get.mockResolvedValue({
      notificationEmails: ['ops1@hb.com', 'ops2@hb.com', 'ops3@hb.com'],
    });
    const order = makeOrder({ items: [makeOrderItem()] });
    orderRepo.findOne.mockResolvedValue(order);

    await listener.handleOrderPaid({ orderId: order.id });

    expect(mailService.sendPlatformOrderNotification).toHaveBeenCalledTimes(1);
    expect(mailService.sendPlatformOrderNotification).toHaveBeenCalledWith(
      ['ops1@hb.com', 'ops2@hb.com', 'ops3@hb.com'],
      order.id,
      expect.any(Array),
      370,
      CurrencyCode.ZAR,
    );
  });

  it('skips a vendor with no resolvable notification email (warns, does not throw)', async () => {
    vendorsService.resolveNotificationEmail.mockResolvedValue(null);
    const order = makeOrder({ items: [makeOrderItem()] });
    orderRepo.findOne.mockResolvedValue(order);

    await expect(listener.handleOrderPaid({ orderId: order.id })).resolves.toBeUndefined();

    expect(mailService.sendVendorOrderNotification).not.toHaveBeenCalled();
    // The platform email is unaffected by the vendor skip.
    expect(mailService.sendPlatformOrderNotification).toHaveBeenCalledTimes(1);
  });

  it('skips the platform email when no notification recipients are configured (warns, does not throw)', async () => {
    platformSettingsService.get.mockResolvedValue({ notificationEmails: [] });
    const order = makeOrder({ items: [makeOrderItem()] });
    orderRepo.findOne.mockResolvedValue(order);

    await expect(listener.handleOrderPaid({ orderId: order.id })).resolves.toBeUndefined();

    expect(mailService.sendPlatformOrderNotification).not.toHaveBeenCalled();
    // The vendor email is unaffected by the platform skip.
    expect(mailService.sendVendorOrderNotification).toHaveBeenCalledTimes(1);
  });

  it('renders each line with its own explicit currency', async () => {
    const items = [
      makeOrderItem({ id: 'line-a', vendorId: 'vendor-a', currency: CurrencyCode.ZAR }),
    ];
    const order = makeOrder({ items, currency: CurrencyCode.ZAR });
    orderRepo.findOne.mockResolvedValue(order);

    await listener.handleOrderPaid({ orderId: order.id });

    expect(mailService.sendVendorOrderNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      order.id,
      [expect.objectContaining({ currency: CurrencyCode.ZAR })],
    );
    expect(mailService.sendPlatformOrderNotification).toHaveBeenCalledWith(
      expect.any(Array),
      order.id,
      [expect.objectContaining({ currency: CurrencyCode.ZAR })],
      expect.any(Number),
      CurrencyCode.ZAR,
    );
    expect(mailService.sendCustomerOrderConfirmation).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      order.id,
      [expect.objectContaining({ currency: CurrencyCode.ZAR })],
      expect.any(Number),
      CurrencyCode.ZAR,
    );
  });

  it('does not propagate a throwing/rejecting vendor mail send — other sends still happen', async () => {
    const items = [
      makeOrderItem({
        id: 'line-a',
        vendorId: 'vendor-a',
        vendor: { id: 'vendor-a', businessName: 'Salt Co' } as never,
      }),
      makeOrderItem({
        id: 'line-b',
        vendorId: 'vendor-b',
        vendor: { id: 'vendor-b', businessName: 'Tea Co' } as never,
      }),
    ];
    const order = makeOrder({ items });
    orderRepo.findOne.mockResolvedValue(order);
    vendorsService.resolveNotificationEmail.mockImplementation((vendorId: string) =>
      Promise.resolve(`${vendorId}@hb.com`),
    );
    mailService.sendVendorOrderNotification.mockImplementation((to: string) => {
      if (to === 'vendor-a@hb.com') return Promise.reject(new Error('Resend down'));
      return Promise.resolve(undefined);
    });

    await expect(listener.handleOrderPaid({ orderId: order.id })).resolves.toBeUndefined();

    // vendor-b's send and the platform send both still happened.
    expect(mailService.sendVendorOrderNotification).toHaveBeenCalledTimes(2);
    expect(mailService.sendPlatformOrderNotification).toHaveBeenCalledTimes(1);
  });

  it('does not propagate when the platform mail send rejects', async () => {
    mailService.sendPlatformOrderNotification.mockRejectedValue(new Error('Resend down'));
    const order = makeOrder({ items: [makeOrderItem()] });
    orderRepo.findOne.mockResolvedValue(order);

    await expect(listener.handleOrderPaid({ orderId: order.id })).resolves.toBeUndefined();
  });

  it('a failing customer-email send does not prevent the vendor/platform sends from completing', async () => {
    mailService.sendCustomerOrderConfirmation.mockRejectedValue(new Error('Resend down'));
    const order = makeOrder({ items: [makeOrderItem()] });
    orderRepo.findOne.mockResolvedValue(order);

    await expect(listener.handleOrderPaid({ orderId: order.id })).resolves.toBeUndefined();

    expect(mailService.sendVendorOrderNotification).toHaveBeenCalledTimes(1);
    expect(mailService.sendPlatformOrderNotification).toHaveBeenCalledTimes(1);
  });

  it('a failing vendor/platform send does not prevent the customer send from completing', async () => {
    mailService.sendVendorOrderNotification.mockRejectedValue(new Error('Resend down'));
    mailService.sendPlatformOrderNotification.mockRejectedValue(new Error('Resend down'));
    const order = makeOrder({ items: [makeOrderItem()] });
    orderRepo.findOne.mockResolvedValue(order);

    await expect(listener.handleOrderPaid({ orderId: order.id })).resolves.toBeUndefined();

    expect(mailService.sendCustomerOrderConfirmation).toHaveBeenCalledTimes(1);
  });

  it('reloads the order by id with the relations needed for vendor/user resolution', async () => {
    const order = makeOrder({ items: [makeOrderItem()] });
    orderRepo.findOne.mockResolvedValue(order);

    await listener.handleOrderPaid({ orderId: order.id });

    expect(orderRepo.findOne).toHaveBeenCalledWith({
      where: { id: order.id },
      relations: ['items', 'items.vendor', 'items.vendor.user', 'user'],
    });
  });
});
