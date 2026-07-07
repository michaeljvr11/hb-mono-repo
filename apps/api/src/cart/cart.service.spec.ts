import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CurrencyCode } from '@hb/shared';
import { CartService, clampQuantity } from './cart.service';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { Product } from '../products/entities/product.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00.000Z');

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Fynbos Honey',
    description: 'Organic honey',
    price: '185.00' as never, // pg returns numeric as string
    currency: CurrencyCode.ZAR,
    stockQuantity: 10,
    images: [],
    categories: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Product;
}

function makeCart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1',
    userId: 'user-1',
    items: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Cart;
}

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'item-1',
    cartId: 'cart-1',
    productId: 'prod-1',
    product: makeProduct(),
    quantity: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as CartItem;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('clampQuantity', () => {
  it('passes through quantities within stock', () => {
    expect(clampQuantity(3, 10)).toBe(3);
  });

  it('clamps to the available stock', () => {
    expect(clampQuantity(15, 10)).toBe(10);
  });

  it('never goes below zero', () => {
    expect(clampQuantity(-5, 10)).toBe(0);
    expect(clampQuantity(3, 0)).toBe(0);
  });
});

describe('CartService', () => {
  let service: CartService;
  let cartRepo: Record<string, jest.Mock>;
  let cartItemRepo: Record<string, jest.Mock>;
  let productRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    cartRepo = {
      findOne: jest.fn(),
      create: jest.fn((x: Partial<Cart>) => x as Cart),
      save: jest.fn((x: Partial<Cart>) =>
        Promise.resolve({ ...x, id: x.id ?? 'cart-1', updatedAt: NOW } as Cart),
      ),
    };
    cartItemRepo = {
      findOne: jest.fn(),
      create: jest.fn((x: Partial<CartItem>) => x as CartItem),
      save: jest.fn((x: Partial<CartItem>) => Promise.resolve(x as CartItem)),
      remove: jest.fn(),
    };
    productRepo = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getRepositoryToken(Cart), useValue: cartRepo },
        { provide: getRepositoryToken(CartItem), useValue: cartItemRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
      ],
    }).compile();

    service = module.get(CartService);
  });

  // ── getCart ────────────────────────────────────────────────────────────────

  it('creates an empty cart on first read', async () => {
    cartRepo.findOne.mockResolvedValue(null);

    const dto = await service.getCart('user-1');

    expect(cartRepo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
    expect(dto.items).toEqual([]);
    expect(dto.totals).toEqual([]);
    expect(dto.itemCount).toBe(0);
  });

  it('only ever queries the caller own cart (ownership by construction)', async () => {
    cartRepo.findOne.mockResolvedValue(makeCart());

    await service.getCart('user-1');

    expect(cartRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('computes line totals and per-currency subtotals server-side (ZAR/NAD never summed)', async () => {
    const zarItem = makeItem({
      id: 'item-1',
      quantity: 2,
      product: makeProduct({ price: '185.00' as never, currency: CurrencyCode.ZAR }),
    });
    const nadItem = makeItem({
      id: 'item-2',
      productId: 'prod-2',
      quantity: 3,
      product: makeProduct({
        id: 'prod-2',
        price: '19.99' as never,
        currency: CurrencyCode.NAD,
      }),
    });
    cartRepo.findOne.mockResolvedValue(makeCart({ items: [zarItem, nadItem] }));

    const dto = await service.getCart('user-1');

    expect(dto.items[0].lineTotal).toBe(370);
    expect(dto.items[1].lineTotal).toBe(59.97);
    expect(dto.totals).toEqual(
      expect.arrayContaining([
        { currency: CurrencyCode.ZAR, subtotal: 370 },
        { currency: CurrencyCode.NAD, subtotal: 59.97 },
      ]),
    );
    expect(dto.totals).toHaveLength(2);
    expect(dto.itemCount).toBe(5);
  });

  it('avoids float drift in totals aggregation (cents math)', async () => {
    // 0.1 + 0.2 style drift: 3 x 0.10 must be exactly 0.30
    const item = makeItem({
      quantity: 3,
      product: makeProduct({ price: '0.10' as never }),
    });
    cartRepo.findOne.mockResolvedValue(makeCart({ items: [item] }));

    const dto = await service.getCart('user-1');

    expect(dto.items[0].lineTotal).toBe(0.3);
    expect(dto.totals[0].subtotal).toBe(0.3);
  });

  // ── addItem ────────────────────────────────────────────────────────────────

  it('adds a new line clamped to available stock', async () => {
    productRepo.findOne.mockResolvedValue(makeProduct({ stockQuantity: 4 }));
    cartRepo.findOne.mockResolvedValue(makeCart({ items: [] }));

    await service.addItem('user-1', { productId: 'prod-1', quantity: 9 });

    expect(cartItemRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'prod-1', quantity: 4 }),
    );
  });

  it('increments an existing line for the same product, clamped to stock', async () => {
    productRepo.findOne.mockResolvedValue(makeProduct({ stockQuantity: 5 }));
    const existing = makeItem({ quantity: 3 });
    cartRepo.findOne.mockResolvedValue(makeCart({ items: [existing] }));

    await service.addItem('user-1', { productId: 'prod-1', quantity: 4 });

    // 3 + 4 = 7 → clamped to 5
    expect(cartItemRepo.save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 5 }));
  });

  it('rejects adding an unknown product with 404', async () => {
    productRepo.findOne.mockResolvedValue(null);

    await expect(
      service.addItem('user-1', { productId: 'nope', quantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects adding an out-of-stock product with 409', async () => {
    productRepo.findOne.mockResolvedValue(makeProduct({ stockQuantity: 0 }));

    await expect(
      service.addItem('user-1', { productId: 'prod-1', quantity: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ── updateItem ─────────────────────────────────────────────────────────────

  it('updates quantity clamped to live stock', async () => {
    cartItemRepo.findOne.mockResolvedValue(
      makeItem({ product: makeProduct({ stockQuantity: 6 }) }),
    );
    cartRepo.findOne.mockResolvedValue(makeCart());

    await service.updateItem('user-1', 'item-1', { quantity: 20 });

    expect(cartItemRepo.save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 6 }));
  });

  it("404s when the item belongs to another user's cart (no existence leak)", async () => {
    // The ownership filter is part of the query itself: cart.userId must match.
    cartItemRepo.findOne.mockResolvedValue(null);

    await expect(service.updateItem('intruder', 'item-1', { quantity: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(cartItemRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1', cart: { userId: 'intruder' } },
      }),
    );
    expect(cartItemRepo.save).not.toHaveBeenCalled();
  });

  it('409s an update when the product has gone out of stock', async () => {
    cartItemRepo.findOne.mockResolvedValue(
      makeItem({ product: makeProduct({ stockQuantity: 0 }) }),
    );

    await expect(service.updateItem('user-1', 'item-1', { quantity: 2 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  // ── removeItem ─────────────────────────────────────────────────────────────

  it('removes an owned item', async () => {
    const item = makeItem();
    cartItemRepo.findOne.mockResolvedValue(item);
    cartRepo.findOne.mockResolvedValue(makeCart());

    await service.removeItem('user-1', 'item-1');

    expect(cartItemRepo.remove).toHaveBeenCalledWith(item);
  });

  it("404s removing an item from another user's cart", async () => {
    cartItemRepo.findOne.mockResolvedValue(null);

    await expect(service.removeItem('intruder', 'item-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(cartItemRepo.remove).not.toHaveBeenCalled();
  });
});
