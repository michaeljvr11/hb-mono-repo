import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CountryCode } from '@hb/shared';
import { CartOriginResolverService } from './cart-origin-resolver.service';
import { Cart } from '../cart/entities/cart.entity';

describe('CartOriginResolverService', () => {
  let service: CartOriginResolverService;
  let cartRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    cartRepo = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CartOriginResolverService,
        { provide: getRepositoryToken(Cart), useValue: cartRepo },
      ],
    }).compile();

    service = module.get(CartOriginResolverService);
  });

  it('resolves the single distinct origin and every product id across a single-origin cart', async () => {
    cartRepo.findOne.mockResolvedValue({
      id: 'cart-1',
      userId: 'user-1',
      items: [
        { productId: 'prod-1', product: { originCountry: CountryCode.NAMIBIA } },
        { productId: 'prod-2', product: { originCountry: CountryCode.NAMIBIA } },
      ],
    });

    await expect(service.resolveCartForUser('user-1')).resolves.toEqual({
      originCountry: CountryCode.NAMIBIA,
      productIds: ['prod-1', 'prod-2'],
    });
    expect(cartRepo.findOne).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      relations: ['items', 'items.product'],
    });
  });

  it('falls back to South Africa when the cart spans more than one origin', async () => {
    cartRepo.findOne.mockResolvedValue({
      id: 'cart-1',
      userId: 'user-1',
      items: [
        { productId: 'prod-1', product: { originCountry: CountryCode.SOUTH_AFRICA } },
        { productId: 'prod-2', product: { originCountry: CountryCode.NAMIBIA } },
      ],
    });

    const result = await service.resolveCartForUser('user-1');
    expect(result.originCountry).toBe(CountryCode.SOUTH_AFRICA);
    expect(result.productIds).toEqual(['prod-1', 'prod-2']);
  });

  it('drops cart lines whose product row is gone from both origin resolution and productIds (FAIL 3)', async () => {
    cartRepo.findOne.mockResolvedValue({
      id: 'cart-1',
      userId: 'user-1',
      items: [
        { productId: 'prod-1', product: { originCountry: CountryCode.NAMIBIA } },
        { productId: 'prod-deleted', product: null },
      ],
    });

    const result = await service.resolveCartForUser('user-1');
    expect(result).toEqual({ originCountry: CountryCode.NAMIBIA, productIds: ['prod-1'] });
  });

  it('rejects with a 400 when the cart has no items', async () => {
    cartRepo.findOne.mockResolvedValue({ id: 'cart-1', userId: 'user-1', items: [] });

    await expect(service.resolveCartForUser('user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects with a 400 when the user has no cart at all', async () => {
    cartRepo.findOne.mockResolvedValue(null);

    await expect(service.resolveCartForUser('user-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
