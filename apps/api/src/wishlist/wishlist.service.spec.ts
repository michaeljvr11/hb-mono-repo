import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CurrencyCode } from '@hb/shared';
import { WishlistService } from './wishlist.service';
import { WishlistItem } from './entities/wishlist-item.entity';
import { Product } from '../products/entities/product.entity';

/** Builds a TypeORM QueryFailedError carrying a Postgres SQLSTATE, as pg-driver errors do. */
function pgError(code: string): QueryFailedError {
  return new QueryFailedError('INSERT ...', [], {
    code,
    toString: () => `error: duplicate key value violates unique constraint`,
  } as never);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-01T12:00:00.000Z');

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

function makeWishlistItem(overrides: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: 'wish-1',
    userId: 'user-1',
    productId: 'prod-1',
    product: makeProduct(),
    createdAt: NOW,
    ...overrides,
  } as WishlistItem;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('WishlistService', () => {
  let service: WishlistService;
  let wishlistItemRepo: Record<string, jest.Mock>;
  let productRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    wishlistItemRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x: Partial<WishlistItem>) => x as WishlistItem),
      save: jest.fn((x: Partial<WishlistItem>) => Promise.resolve(x as WishlistItem)),
      remove: jest.fn(),
    };
    productRepo = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        WishlistService,
        { provide: getRepositoryToken(WishlistItem), useValue: wishlistItemRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
      ],
    }).compile();

    service = module.get(WishlistService);
  });

  // ── getWishlist ────────────────────────────────────────────────────────────

  it('returns an empty wishlist, never null', async () => {
    wishlistItemRepo.find.mockResolvedValue([]);

    const dto = await service.getWishlist('user-1');

    expect(dto).toEqual({ items: [], itemCount: 0 });
  });

  it('resolves live product name/price/currency/stock at read time', async () => {
    const item = makeWishlistItem({
      product: makeProduct({
        name: 'Rooibos Tea',
        price: '42.50' as never,
        currency: CurrencyCode.NAD,
        stockQuantity: 3,
      }),
    });
    wishlistItemRepo.find.mockResolvedValue([item]);

    const dto = await service.getWishlist('user-1');

    expect(dto.items[0]).toMatchObject({
      id: 'wish-1',
      productId: 'prod-1',
      productName: 'Rooibos Tea',
      price: 42.5,
      currency: CurrencyCode.NAD,
      stockQuantity: 3,
    });
  });

  it('picks the primary image when one is flagged isPrimary', async () => {
    const item = makeWishlistItem({
      product: makeProduct({
        images: [
          { id: 'img-1', url: '/uploads/a.jpg', isPrimary: false } as never,
          { id: 'img-2', url: '/uploads/b.jpg', isPrimary: true } as never,
        ],
      }),
    });
    wishlistItemRepo.find.mockResolvedValue([item]);

    const dto = await service.getWishlist('user-1');

    expect(dto.items[0].imageUrl).toBe('/uploads/b.jpg');
  });

  it('falls back to the first image when none is flagged primary', async () => {
    const item = makeWishlistItem({
      product: makeProduct({
        images: [
          { id: 'img-1', url: '/uploads/a.jpg', isPrimary: false } as never,
          { id: 'img-2', url: '/uploads/b.jpg', isPrimary: false } as never,
        ],
      }),
    });
    wishlistItemRepo.find.mockResolvedValue([item]);

    const dto = await service.getWishlist('user-1');

    expect(dto.items[0].imageUrl).toBe('/uploads/a.jpg');
  });

  it('leaves imageUrl undefined when the product has no images', async () => {
    const item = makeWishlistItem({ product: makeProduct({ images: [] }) });
    wishlistItemRepo.find.mockResolvedValue([item]);

    const dto = await service.getWishlist('user-1');

    expect(dto.items[0].imageUrl).toBeUndefined();
  });

  it('does not crash the mapper when a row has no product relation', async () => {
    const orphan = makeWishlistItem({ id: 'wish-2', product: undefined });
    wishlistItemRepo.find.mockResolvedValue([orphan]);

    const dto = await service.getWishlist('user-1');

    expect(dto.items).toEqual([]);
    expect(dto.itemCount).toBe(0);
  });

  it('itemCount is a row count, not a unit sum', async () => {
    wishlistItemRepo.find.mockResolvedValue([
      makeWishlistItem({ id: 'wish-1', productId: 'prod-1' }),
      makeWishlistItem({
        id: 'wish-2',
        productId: 'prod-2',
        product: makeProduct({ id: 'prod-2' }),
      }),
    ]);

    const dto = await service.getWishlist('user-1');

    expect(dto.itemCount).toBe(2);
  });

  it('orders items newest-first', async () => {
    wishlistItemRepo.find.mockResolvedValue([]);

    await service.getWishlist('user-1');

    expect(wishlistItemRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { createdAt: 'DESC' } }),
    );
  });

  it('only ever queries the caller own wishlist rows (ownership by construction)', async () => {
    wishlistItemRepo.find.mockResolvedValue([]);

    await service.getWishlist('user-1');

    expect(wishlistItemRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  // ── addItem ────────────────────────────────────────────────────────────────

  it('adds a new wishlist row for a known product', async () => {
    productRepo.findOne.mockResolvedValue(makeProduct());
    wishlistItemRepo.findOne.mockResolvedValue(null);
    wishlistItemRepo.find.mockResolvedValue([]);

    await service.addItem('user-1', { productId: 'prod-1' });

    expect(wishlistItemRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', productId: 'prod-1' }),
    );
  });

  it('rejects adding an unknown product with 404', async () => {
    productRepo.findOne.mockResolvedValue(null);

    await expect(service.addItem('user-1', { productId: 'nope' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(wishlistItemRepo.save).not.toHaveBeenCalled();
  });

  it('allows adding an out-of-stock product (unlike the cart, saving for later must not error)', async () => {
    productRepo.findOne.mockResolvedValue(makeProduct({ stockQuantity: 0 }));
    wishlistItemRepo.findOne.mockResolvedValue(null);
    wishlistItemRepo.find.mockResolvedValue([]);

    await expect(service.addItem('user-1', { productId: 'prod-1' })).resolves.toBeDefined();
    expect(wishlistItemRepo.save).toHaveBeenCalled();
  });

  it('is idempotent: re-adding an already-wishlisted product does not save a second row or throw', async () => {
    productRepo.findOne.mockResolvedValue(makeProduct());
    wishlistItemRepo.findOne.mockResolvedValue(makeWishlistItem());
    wishlistItemRepo.find.mockResolvedValue([makeWishlistItem()]);

    await expect(service.addItem('user-1', { productId: 'prod-1' })).resolves.toBeDefined();
    expect(wishlistItemRepo.save).not.toHaveBeenCalled();
  });

  it('swallows a concurrent-insert unique-violation (SQLSTATE 23505) and still returns the list, not an error', async () => {
    productRepo.findOne.mockResolvedValue(makeProduct());
    // Lost the race: no existing row seen at check-time, but the insert
    // collides because another request won the race between check and save.
    wishlistItemRepo.findOne.mockResolvedValue(null);
    wishlistItemRepo.save.mockRejectedValue(pgError('23505'));
    wishlistItemRepo.find.mockResolvedValue([makeWishlistItem()]);

    await expect(service.addItem('user-1', { productId: 'prod-1' })).resolves.toEqual(
      expect.objectContaining({ itemCount: 1 }),
    );
  });

  it('rethrows a non-unique-violation database error from the insert rather than swallowing it', async () => {
    productRepo.findOne.mockResolvedValue(makeProduct());
    wishlistItemRepo.findOne.mockResolvedValue(null);
    wishlistItemRepo.save.mockRejectedValue(pgError('23503')); // foreign-key violation, not a duplicate

    await expect(service.addItem('user-1', { productId: 'prod-1' })).rejects.toBeInstanceOf(
      QueryFailedError,
    );
  });

  it('rethrows a non-database error from the insert unchanged', async () => {
    productRepo.findOne.mockResolvedValue(makeProduct());
    wishlistItemRepo.findOne.mockResolvedValue(null);
    const boom = new Error('connection reset');
    wishlistItemRepo.save.mockRejectedValue(boom);

    await expect(service.addItem('user-1', { productId: 'prod-1' })).rejects.toBe(boom);
  });

  it('scopes the duplicate check to the caller (userId + productId)', async () => {
    productRepo.findOne.mockResolvedValue(makeProduct());
    wishlistItemRepo.findOne.mockResolvedValue(null);
    wishlistItemRepo.find.mockResolvedValue([]);

    await service.addItem('user-1', { productId: 'prod-1' });

    expect(wishlistItemRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', productId: 'prod-1' } }),
    );
  });

  // ── removeItem ─────────────────────────────────────────────────────────────

  it('removes an owned wishlist row by productId', async () => {
    const item = makeWishlistItem();
    wishlistItemRepo.findOne.mockResolvedValue(item);
    wishlistItemRepo.find.mockResolvedValue([]);

    await service.removeItem('user-1', 'prod-1');

    expect(wishlistItemRepo.remove).toHaveBeenCalledWith(item);
  });

  it("404s removing a product that isn't on the caller's wishlist (no existence leak)", async () => {
    wishlistItemRepo.findOne.mockResolvedValue(null);

    await expect(service.removeItem('user-1', 'prod-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(wishlistItemRepo.remove).not.toHaveBeenCalled();
  });

  it("404s removing another user's wishlist row — the query itself is scoped by userId", async () => {
    wishlistItemRepo.findOne.mockResolvedValue(null);

    await expect(service.removeItem('intruder', 'prod-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(wishlistItemRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'intruder', productId: 'prod-1' } }),
    );
    expect(wishlistItemRepo.remove).not.toHaveBeenCalled();
  });
});
