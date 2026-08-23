import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { QueryFailedError } from 'typeorm';
import { OrderStatus, ReviewIneligibilityReason, ReviewSort } from '@hb/shared';
import { ReviewsService } from './reviews.service';
import { Review } from './entities/review.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

/** Builds a TypeORM QueryFailedError carrying a Postgres SQLSTATE, as pg-driver errors do. */
function pgError(code: string): QueryFailedError {
  return new QueryFailedError('INSERT ...', [], {
    code,
    toString: () => `error: duplicate key value violates unique constraint`,
  } as never);
}

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

function makeVendor(overrides: Partial<Vendor> = {}): Vendor {
  return { id: 'vendor-1', userId: 'vendor-user-1', ...overrides } as Vendor;
}

/** Fake for the EXISTS-join query builder (innerJoin/where/andWhere/getExists). */
function makeExistsQb(exists: boolean) {
  const qb = {
    innerJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    getExists: jest.fn(),
  };
  qb.innerJoin.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  qb.getExists.mockResolvedValue(exists);
  return qb;
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
  let reviewRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let productRepo: { findOne: jest.Mock };
  let orderItemRepo: { createQueryBuilder: jest.Mock };
  let vendorRepo: { findOne: jest.Mock };

  /** Wires the two createQueryBuilder() calls findAllForProduct makes, in order: aggregate then list. */
  function stub(raw: { average: string | null; count: string }, reviews: Review[]) {
    reviewRepo.createQueryBuilder
      .mockReturnValueOnce(makeAggregateQb(raw))
      .mockReturnValueOnce(makeListQb(reviews));
  }

  beforeEach(async () => {
    reviewRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data) => ({ ...data }) as Review),
      save: jest.fn(),
      remove: jest.fn(),
    };
    productRepo = { findOne: jest.fn() };
    orderItemRepo = { createQueryBuilder: jest.fn() };
    vendorRepo = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: reviewRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepo },
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
      ],
    }).compile();

    service = module.get(ReviewsService);
    productRepo.findOne.mockResolvedValue(makeProduct());
    reviewRepo.findOne.mockResolvedValue(null);
    vendorRepo.findOne.mockResolvedValue(null);
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

  // ── PR-2: checkEligibility ───────────────────────────────────────────────

  describe('checkEligibility', () => {
    it('404s on an unknown productId', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(service.checkEligibility(makeUser(), 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('is eligible when a delivered order for the caller contains the product', async () => {
      orderItemRepo.createQueryBuilder.mockReturnValue(makeExistsQb(true));

      const result = await service.checkEligibility(makeUser(), 'prod-1');

      expect(result).toEqual({ canReview: true, reason: null });
    });

    const NON_DELIVERED_STATUSES = Object.values(OrderStatus).filter(
      (status) => status !== OrderStatus.DELIVERED,
    );

    // Parametrised over the FULL OrderStatus matrix (everything but DELIVERED) —
    // asserted against the enum itself so a newly added status can't silently
    // become qualifying without a test failing here.
    it.each(NON_DELIVERED_STATUSES)(
      'is ineligible (not_purchased) when the only order is status=%s',
      async (status) => {
        // The gate's SQL only ever asks for OrderStatus.DELIVERED — a real DB
        // would return no rows for any other status, which is what getExists:false models.
        const qb = makeExistsQb(false);
        orderItemRepo.createQueryBuilder.mockReturnValue(qb);

        const result = await service.checkEligibility(makeUser(), 'prod-1');

        expect(qb.andWhere).toHaveBeenCalledWith('order.status = :status', {
          status: OrderStatus.DELIVERED,
        });
        expect(qb.andWhere).not.toHaveBeenCalledWith('order.status = :status', { status });
        expect(result).toEqual({
          canReview: false,
          reason: ReviewIneligibilityReason.NOT_PURCHASED,
        });
      },
    );

    it("does not qualify from another user's delivered order for the same product", async () => {
      const qb = makeExistsQb(false); // caller's own userId has no delivered order
      orderItemRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.checkEligibility(makeUser({ id: 'user-2' }), 'prod-1');

      expect(qb.andWhere).toHaveBeenCalledWith('order.userId = :userId', { userId: 'user-2' });
      expect(result).toEqual({ canReview: false, reason: ReviewIneligibilityReason.NOT_PURCHASED });
    });

    it('does not qualify from a delivered order that does not contain the product', async () => {
      const qb = makeExistsQb(false);
      orderItemRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.checkEligibility(makeUser(), 'prod-2');

      expect(qb.where).toHaveBeenCalledWith('orderItem.productId = :productId', {
        productId: 'prod-2',
      });
      expect(result).toEqual({ canReview: false, reason: ReviewIneligibilityReason.NOT_PURCHASED });
    });

    it('is ineligible (already_reviewed) with the existing review id when a review already exists', async () => {
      reviewRepo.findOne.mockResolvedValue(makeReview({ id: 'rev-99' }));

      const result = await service.checkEligibility(makeUser(), 'prod-1');

      expect(result).toEqual({
        canReview: false,
        reason: ReviewIneligibilityReason.ALREADY_REVIEWED,
        existingReviewId: 'rev-99',
      });
      expect(orderItemRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('is ineligible (own_listing) when the caller is the vendor for the product', async () => {
      productRepo.findOne.mockResolvedValue(makeProduct({ vendorId: 'vendor-1' }));
      vendorRepo.findOne.mockResolvedValue(makeVendor({ id: 'vendor-1', userId: 'user-1' }));

      const result = await service.checkEligibility(makeUser({ id: 'user-1' }), 'prod-1');

      expect(result).toEqual({ canReview: false, reason: ReviewIneligibilityReason.OWN_LISTING });
      // Own-listing is checked first — never reaches the duplicate/order lookups.
      expect(reviewRepo.findOne).not.toHaveBeenCalled();
      expect(orderItemRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('is not own_listing for a platform (vendorless) product even for a vendor caller', async () => {
      productRepo.findOne.mockResolvedValue(makeProduct({ vendorId: undefined }));
      orderItemRepo.createQueryBuilder.mockReturnValue(makeExistsQb(true));

      const result = await service.checkEligibility(makeUser({ id: 'user-1' }), 'prod-1');

      expect(vendorRepo.findOne).not.toHaveBeenCalled();
      expect(result.canReview).toBe(true);
    });
  });

  // ── PR-2: create ─────────────────────────────────────────────────────────

  describe('create', () => {
    const validDto = { rating: 5, body: 'Really great product, would buy again.' };

    it('404s on an unknown productId', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(service.create(makeUser(), 'nope', validDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('403s when the caller is the vendor for the product, even with a delivered order', async () => {
      productRepo.findOne.mockResolvedValue(makeProduct({ vendorId: 'vendor-1' }));
      vendorRepo.findOne.mockResolvedValue(makeVendor({ id: 'vendor-1', userId: 'user-1' }));
      orderItemRepo.createQueryBuilder.mockReturnValue(makeExistsQb(true));

      await expect(
        service.create(makeUser({ id: 'user-1' }), 'prod-1', validDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(reviewRepo.save).not.toHaveBeenCalled();
    });

    it('409s (pre-check) on a duplicate review without touching the existing row', async () => {
      reviewRepo.findOne.mockResolvedValue(makeReview());

      await expect(service.create(makeUser(), 'prod-1', validDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(reviewRepo.save).not.toHaveBeenCalled();
    });

    it.each(NON_DELIVERED_STATUSES_FOR_CREATE())(
      '403s when the caller has no delivered order (status=%s)',
      async () => {
        orderItemRepo.createQueryBuilder.mockReturnValue(makeExistsQb(false));

        await expect(service.create(makeUser(), 'prod-1', validDto)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        expect(reviewRepo.save).not.toHaveBeenCalled();
      },
    );

    it('surfaces a concurrent-insert unique violation (23505) as the same 409', async () => {
      orderItemRepo.createQueryBuilder.mockReturnValue(makeExistsQb(true));
      reviewRepo.save.mockRejectedValue(pgError('23505'));

      await expect(service.create(makeUser(), 'prod-1', validDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rethrows a non-unique-violation save error', async () => {
      orderItemRepo.createQueryBuilder.mockReturnValue(makeExistsQb(true));
      const dbError = new Error('connection lost');
      reviewRepo.save.mockRejectedValue(dbError);

      await expect(service.create(makeUser(), 'prod-1', validDto)).rejects.toBe(dbError);
    });

    it('persists isVerifiedPurchase as true and returns the created review as a DTO', async () => {
      orderItemRepo.createQueryBuilder.mockReturnValue(makeExistsQb(true));
      reviewRepo.save.mockImplementation((review: Review) => ({
        ...review,
        id: 'rev-new',
        createdAt: NOW,
        updatedAt: NOW,
      }));

      const result = await service.create(makeUser(), 'prod-1', validDto);

      expect(reviewRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          userId: 'user-1',
          rating: validDto.rating,
          body: validDto.body,
          isVerifiedPurchase: true,
        }),
      );
      expect(result).toMatchObject({
        id: 'rev-new',
        productId: 'prod-1',
        rating: validDto.rating,
        body: validDto.body,
        isVerifiedPurchase: true,
      });
    });
  });

  // ── PR-5: update ─────────────────────────────────────────────────────────

  describe('update', () => {
    const patch = { rating: 4, body: 'Updated my mind, still good though.' };

    it('rejects an empty payload with a 400 (neither rating nor body present)', async () => {
      await expect(service.update(makeUser(), 'rev-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(reviewRepo.findOne).not.toHaveBeenCalled();
      expect(reviewRepo.save).not.toHaveBeenCalled();
    });

    it('404s on an unknown id', async () => {
      reviewRepo.findOne.mockResolvedValue(null);

      await expect(service.update(makeUser(), 'nope', patch)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("404s (never 403) editing another user's review", async () => {
      // Scoped by (id, userId) — a row owned by someone else reads as missing.
      reviewRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(makeUser({ id: 'user-2' }), 'rev-1', patch),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(reviewRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'rev-1', userId: 'user-2' },
      });
    });

    it('the owner can edit rating and body', async () => {
      const existing = makeReview();
      reviewRepo.findOne.mockResolvedValue(existing);
      reviewRepo.save.mockImplementation((review: Review) => ({
        ...review,
        updatedAt: new Date('2026-08-10T00:00:00.000Z'),
      }));

      const result = await service.update(makeUser(), 'rev-1', patch);

      expect(result.rating).toBe(patch.rating);
      expect(result.body).toBe(patch.body);
    });

    it('allows a partial patch (rating only, body untouched)', async () => {
      const existing = makeReview({ body: 'Original body text here.' });
      reviewRepo.findOne.mockResolvedValue(existing);
      reviewRepo.save.mockImplementation((review: Review) => review);

      const result = await service.update(makeUser(), 'rev-1', { rating: 2 });

      expect(result.rating).toBe(2);
      expect(result.body).toBe('Original body text here.');
    });

    it('never mutates productId, userId, or isVerifiedPurchase even given a raw payload with those keys', async () => {
      const existing = makeReview({
        productId: 'prod-1',
        userId: 'user-1',
        isVerifiedPurchase: true,
      });
      reviewRepo.findOne.mockResolvedValue(existing);
      reviewRepo.save.mockImplementation((review: Review) => review);

      // Not expressible via UpdateReviewDto's shape, but assert the service
      // itself ignores extra keys rather than blindly spreading dto onto
      // the entity.
      const rawPayload = {
        rating: 3,
        body: 'Trying to smuggle other fields in.',
        productId: 'prod-2',
        userId: 'user-9',
        isVerifiedPurchase: false,
      } as unknown as UpdateReviewDto;

      const saved = await service.update(makeUser(), 'rev-1', rawPayload);

      expect(saved.productId).toBe('prod-1');
      expect(reviewRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          userId: 'user-1',
          isVerifiedPurchase: true,
        }),
      );
    });
  });

  // ── PR-5: remove ─────────────────────────────────────────────────────────

  describe('remove', () => {
    it('404s on an unknown id', async () => {
      reviewRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(makeUser(), 'nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(reviewRepo.remove).not.toHaveBeenCalled();
    });

    it("404s (never 403) deleting another user's review", async () => {
      reviewRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(makeUser({ id: 'user-2' }), 'rev-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(reviewRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'rev-1', userId: 'user-2' },
      });
    });

    it('the owner can delete their review', async () => {
      const existing = makeReview();
      reviewRepo.findOne.mockResolvedValue(existing);

      await service.remove(makeUser(), 'rev-1');

      expect(reviewRepo.remove).toHaveBeenCalledWith(existing);
    });
  });

  // ── PR-5: summary recomputes after edit/delete ──────────────────────────

  describe('summary after mutation', () => {
    it('recomputes averageRating after an edit that changes the rating', async () => {
      reviewRepo.findOne.mockResolvedValue(makeReview({ rating: 5 }));
      reviewRepo.save.mockImplementation((review: Review) => review);

      await service.update(makeUser(), 'rev-1', { rating: 1 });

      // Post-edit read is a fresh live aggregate — simulate the new average.
      stub({ average: '1', count: '1' }, [makeReview({ rating: 1 })]);
      const dto = await service.findAllForProduct('prod-1');

      expect(dto.summary).toEqual({ averageRating: 1, reviewCount: 1 });
    });

    it('deleting the last review for a product brings averageRating back to null, not 0', async () => {
      reviewRepo.findOne.mockResolvedValue(makeReview());

      await service.remove(makeUser(), 'rev-1');

      stub({ average: null, count: '0' }, []);
      const dto = await service.findAllForProduct('prod-1');

      expect(dto.summary).toEqual({ averageRating: null, reviewCount: 0 });
    });
  });
});

/** Same "everything but delivered" matrix as checkEligibility's, reused for create's gate. */
function NON_DELIVERED_STATUSES_FOR_CREATE(): OrderStatus[] {
  return Object.values(OrderStatus).filter((status) => status !== OrderStatus.DELIVERED);
}

// ── PR-2: CreateReviewDto validation ────────────────────────────────────────

describe('CreateReviewDto validation', () => {
  async function errorsFor(payload: Record<string, unknown>) {
    const instance = plainToInstance(CreateReviewDto, payload);
    return validate(instance);
  }

  it('accepts a valid payload', async () => {
    const errors = await errorsFor({ rating: 5, body: '1234567890' });
    expect(errors).toHaveLength(0);
  });

  it.each([0, 6, 3.5])('rejects an out-of-bounds/non-integer rating: %s', async (rating) => {
    const errors = await errorsFor({ rating, body: '1234567890' });
    expect(errors.some((e) => e.property === 'rating')).toBe(true);
  });

  it('rejects a body shorter than 10 characters', async () => {
    const errors = await errorsFor({ rating: 5, body: 'too short' });
    expect(errors.some((e) => e.property === 'body')).toBe(true);
  });

  it('rejects a body longer than 2000 characters', async () => {
    const errors = await errorsFor({ rating: 5, body: 'a'.repeat(2001) });
    expect(errors.some((e) => e.property === 'body')).toBe(true);
  });

  it('rejects a rating-only submission (missing body)', async () => {
    const errors = await errorsFor({ rating: 5 });
    expect(errors.some((e) => e.property === 'body')).toBe(true);
  });

  it('rejects a whitespace-only body', async () => {
    const errors = await errorsFor({ rating: 5, body: '                    ' });
    expect(errors.some((e) => e.property === 'body')).toBe(true);
  });

  it('trims surrounding whitespace before enforcing the length bound', async () => {
    const instance = plainToInstance(CreateReviewDto, { rating: 5, body: '   1234567890   ' });
    expect(instance.body).toBe('1234567890');
    expect(await validate(instance)).toHaveLength(0);
  });
});

// ── PR-5: UpdateReviewDto validation ────────────────────────────────────────

describe('UpdateReviewDto validation', () => {
  async function errorsFor(payload: Record<string, unknown>) {
    const instance = plainToInstance(UpdateReviewDto, payload);
    return validate(instance);
  }

  it('accepts a valid rating-only payload', async () => {
    expect(await errorsFor({ rating: 4 })).toHaveLength(0);
  });

  it('accepts a valid body-only payload', async () => {
    expect(await errorsFor({ body: 'Updated review body text.' })).toHaveLength(0);
  });

  it('accepts a valid payload with both fields', async () => {
    expect(await errorsFor({ rating: 3, body: 'Updated review body text.' })).toHaveLength(0);
  });

  it.each([0, 6, 3.5])('rejects an out-of-bounds/non-integer rating: %s', async (rating) => {
    const errors = await errorsFor({ rating });
    expect(errors.some((e) => e.property === 'rating')).toBe(true);
  });

  it('rejects a body shorter than 10 characters', async () => {
    const errors = await errorsFor({ body: 'too short' });
    expect(errors.some((e) => e.property === 'body')).toBe(true);
  });

  it('rejects a body longer than 2000 characters', async () => {
    const errors = await errorsFor({ body: 'a'.repeat(2001) });
    expect(errors.some((e) => e.property === 'body')).toBe(true);
  });

  it('rejects a whitespace-only body', async () => {
    const errors = await errorsFor({ body: '                    ' });
    expect(errors.some((e) => e.property === 'body')).toBe(true);
  });

  it('trims surrounding whitespace before enforcing the length bound', async () => {
    const instance = plainToInstance(UpdateReviewDto, { body: '   1234567890   ' });
    expect(instance.body).toBe('1234567890');
    expect(await validate(instance)).toHaveLength(0);
  });

  it('DTO-level validation alone does not reject an empty {} payload — the service enforces that', async () => {
    // class-validator's @IsOptional() on both fields means {} passes shape
    // validation; ReviewsService.update is what throws the 400 for "neither present".
    expect(await errorsFor({})).toHaveLength(0);
  });
});
