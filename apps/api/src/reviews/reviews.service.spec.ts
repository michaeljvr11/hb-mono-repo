import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ReviewSort } from '@hb/shared';
import { ReviewsService } from './reviews.service';
import { Review } from './entities/review.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';

const NOW = new Date('2026-08-01T12:00:00.000Z');

function makeProduct(overrides: Partial<Product> = {}): Product {
  return { id: 'prod-1', name: 'Fynbos Honey', ...overrides } as Product;
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'michael@example.com',
    firstName: 'Michael',
    lastName: 'Jansen',
    ...overrides,
  } as User;
}

function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    id: 'rev-1',
    productId: 'prod-1',
    userId: 'user-1',
    rating: 5,
    body: 'Great product',
    isVerifiedPurchase: true,
    user: makeUser(),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Review;
}

/** Fake for the aggregate query builder (select/addSelect/where/getRawOne). */
function makeAggregateQb(raw: { average: string | null; count: string }) {
  const qb = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    getRawOne: jest.fn(),
  };
  qb.select.mockReturnValue(qb);
  qb.addSelect.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  qb.getRawOne.mockResolvedValue(raw);
  return qb;
}

/** Fake for the paginated list query builder (leftJoinAndSelect/where/orderBy/.../getMany). */
function makeListQb(reviews: Review[]) {
  const qb = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getMany: jest.fn(),
  };
  qb.leftJoinAndSelect.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);
  qb.addOrderBy.mockReturnValue(qb);
  qb.skip.mockReturnValue(qb);
  qb.take.mockReturnValue(qb);
  qb.getMany.mockResolvedValue(reviews);
  return qb;
}

describe('ReviewsService', () => {
  let service: ReviewsService;
  let reviewRepo: { createQueryBuilder: jest.Mock };
  let productRepo: { findOne: jest.Mock };

  /** Wires the two createQueryBuilder() calls findAllForProduct makes, in order: aggregate then list. */
  function stub(raw: { average: string | null; count: string }, reviews: Review[]) {
    reviewRepo.createQueryBuilder
      .mockReturnValueOnce(makeAggregateQb(raw))
      .mockReturnValueOnce(makeListQb(reviews));
  }

  beforeEach(async () => {
    reviewRepo = { createQueryBuilder: jest.fn() };
    productRepo = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: reviewRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
      ],
    }).compile();

    service = module.get(ReviewsService);
    productRepo.findOne.mockResolvedValue(makeProduct());
  });

  // ── Existence check ──────────────────────────────────────────────────────

  it('404s on an unknown productId rather than returning an empty page', async () => {
    productRepo.findOne.mockResolvedValue(null);

    await expect(service.findAllForProduct('nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(reviewRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  // ── Summary: average rounding + null-on-zero ────────────────────────────

  it('rounds averageRating to one decimal', async () => {
    stub({ average: '4.666666666666667', count: '3' }, []);

    const dto = await service.findAllForProduct('prod-1');

    expect(dto.summary).toEqual({ averageRating: 4.7, reviewCount: 3 });
  });

  it('rounds down correctly too (not always ceiling)', async () => {
    stub({ average: '3.14', count: '2' }, []);

    const dto = await service.findAllForProduct('prod-1');

    expect(dto.summary.averageRating).toBe(3.1);
  });

  it('averageRating is null (never 0) when there are zero reviews', async () => {
    stub({ average: null, count: '0' }, []);

    const dto = await service.findAllForProduct('prod-1');

    expect(dto.summary).toEqual({ averageRating: null, reviewCount: 0 });
  });

  // ── Pagination envelope ──────────────────────────────────────────────────

  it('returns the pagination envelope with total sourced from the aggregate count', async () => {
    stub({ average: '5', count: '7' }, [makeReview()]);

    const dto = await service.findAllForProduct('prod-1', { page: 2, limit: 5 });

    expect(dto.total).toBe(7);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(5);
    expect(dto.items).toHaveLength(1);
  });

  it('defaults to page 1 / limit 10 when omitted', async () => {
    stub({ average: null, count: '0' }, []);

    const dto = await service.findAllForProduct('prod-1');

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(10);
  });

  it('clamps an oversized limit server-side rather than rejecting it', async () => {
    stub({ average: null, count: '0' }, []);

    const dto = await service.findAllForProduct('prod-1', { limit: 9999 });

    expect(dto.limit).toBe(50);
  });

  // ── Sort ordering ────────────────────────────────────────────────────────

  it.each([
    [ReviewSort.NEWEST, 'review.createdAt', 'DESC'],
    [ReviewSort.HIGHEST, 'review.rating', 'DESC'],
    [ReviewSort.LOWEST, 'review.rating', 'ASC'],
  ])('sort=%s orders by %s %s', async (sort, column, direction) => {
    const aggQb = makeAggregateQb({ average: null, count: '0' });
    const listQb = makeListQb([]);
    reviewRepo.createQueryBuilder.mockReturnValueOnce(aggQb).mockReturnValueOnce(listQb);

    await service.findAllForProduct('prod-1', { sort: sort });

    expect(listQb.orderBy).toHaveBeenCalledWith(column, direction);
  });

  it('defaults to newest when sort is omitted', async () => {
    const listQb = makeListQb([]);
    reviewRepo.createQueryBuilder
      .mockReturnValueOnce(makeAggregateQb({ average: null, count: '0' }))
      .mockReturnValueOnce(listQb);

    await service.findAllForProduct('prod-1');

    expect(listQb.orderBy).toHaveBeenCalledWith('review.createdAt', 'DESC');
  });

  // ── authorName derivation ────────────────────────────────────────────────

  it('derives authorName as first name + last initial', async () => {
    stub({ average: '5', count: '1' }, [
      makeReview({ user: makeUser({ firstName: 'Michael', lastName: 'Jansen' }) }),
    ]);

    const dto = await service.findAllForProduct('prod-1');

    expect(dto.items[0].authorName).toBe('Michael J.');
  });

  it('falls back to first name alone when lastName is missing', async () => {
    stub({ average: '5', count: '1' }, [
      makeReview({ user: makeUser({ firstName: 'Michael', lastName: undefined }) }),
    ]);

    const dto = await service.findAllForProduct('prod-1');

    expect(dto.items[0].authorName).toBe('Michael');
  });

  it('falls back to "H&B Customer" when firstName is missing', async () => {
    stub({ average: '5', count: '1' }, [
      makeReview({ user: makeUser({ firstName: undefined, lastName: undefined }) }),
    ]);

    const dto = await service.findAllForProduct('prod-1');

    expect(dto.items[0].authorName).toBe('H&B Customer');
  });

  it('falls back to "H&B Customer" when the user relation is missing entirely', async () => {
    stub({ average: '5', count: '1' }, [makeReview({ user: undefined })]);

    const dto = await service.findAllForProduct('prod-1');

    expect(dto.items[0].authorName).toBe('H&B Customer');
  });

  // ── No PII ───────────────────────────────────────────────────────────────

  it('never includes the reviewer email or raw name fields in the DTO', async () => {
    stub({ average: '5', count: '1' }, [makeReview()]);

    const dto = await service.findAllForProduct('prod-1');

    const item = dto.items[0] as Record<string, unknown>;
    expect(item.email).toBeUndefined();
    expect(item.firstName).toBeUndefined();
    expect(item.lastName).toBeUndefined();
    expect(JSON.stringify(dto)).not.toContain('michael@example.com');
    expect(Object.keys(item).sort()).toEqual(
      [
        'authorName',
        'body',
        'createdAt',
        'id',
        'isVerifiedPurchase',
        'productId',
        'rating',
        'updatedAt',
      ].sort(),
    );
  });
});
