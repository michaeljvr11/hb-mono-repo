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

  it('resolves the single distinct origin across a single-origin cart', async () => {
    cartRepo.findOne.mockResolvedValue({
      id: 'cart-1',
      userId: 'user-1',
      items: [
        { product: { originCountry: CountryCode.NAMIBIA } },
        { product: { originCountry: CountryCode.NAMIBIA } },
      ],
    });

    await expect(service.resolveForUser('user-1')).resolves.toBe(CountryCode.NAMIBIA);
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
        { product: { originCountry: CountryCode.SOUTH_AFRICA } },
        { product: { originCountry: CountryCode.NAMIBIA } },
      ],
    });

    await expect(service.resolveForUser('user-1')).resolves.toBe(CountryCode.SOUTH_AFRICA);
  });

  it('rejects with a 400 when the cart has no items', async () => {
    cartRepo.findOne.mockResolvedValue({ id: 'cart-1', userId: 'user-1', items: [] });

    await expect(service.resolveForUser('user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects with a 400 when the user has no cart at all', async () => {
    cartRepo.findOne.mockResolvedValue(null);

    await expect(service.resolveForUser('user-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
