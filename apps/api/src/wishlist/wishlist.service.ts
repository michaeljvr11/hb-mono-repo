import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { WishlistDto, WishlistItemDto } from '@hb/shared';
import { WishlistItem } from './entities/wishlist-item.entity';
import { Product } from '../products/entities/product.entity';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505';

/**
 * Server-side "save for later" list for authenticated users. Like the cart,
 * it stores a product ref ONLY — never money — and every field the UI needs
 * (name/price/currency/stock/image) is resolved LIVE from `products` at
 * response time (see WishlistDto in @hb/shared).
 *
 * Unlike the cart, adding a wishlist item never rejects an out-of-stock
 * product: saving something for later is exactly what a shopper does when
 * it's out of stock. It also never re-checks stock to clamp anything — a
 * wishlist has no quantity to clamp.
 *
 * Ownership: every read/write is scoped by the caller's userId — a user can
 * never see or touch another user's wishlist rows. A productId that isn't
 * on the caller's wishlist is a plain 404 (no existence leak), same as cart.
 */
@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem)
    private readonly wishlistItemRepository: Repository<WishlistItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async getWishlist(userId: string): Promise<WishlistDto> {
    const items = await this.findItems(userId);
    return this.toDto(items);
  }

  /**
   * Idempotent add: re-adding an already-wishlisted product returns the
   * unchanged list with 200, never a 409/conflict — a double-tapped heart
   * must not error. The `UNIQUE (userId, productId)` DB constraint is the
   * backstop against a concurrent double-add race; a unique-violation on
   * insert is swallowed and we fall through to returning the current list.
   */
  async addItem(userId: string, dto: AddWishlistItemDto): Promise<WishlistDto> {
    const product = await this.productRepository.findOne({ where: { id: dto.productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const existing = await this.wishlistItemRepository.findOne({
      where: { userId, productId: dto.productId },
    });

    if (!existing) {
      const item = this.wishlistItemRepository.create({ userId, productId: dto.productId });
      try {
        await this.wishlistItemRepository.save(item);
      } catch (error) {
        if (!this.isUniqueViolation(error)) {
          throw error;
        }
        // Lost a concurrent double-add race — the row already exists; treat
        // it like the `existing` branch above and just return the list.
      }
    }

    return this.getWishlist(userId);
  }

  async removeItem(userId: string, productId: string): Promise<WishlistDto> {
    const item = await this.findOwnedItem(userId, productId);
    await this.wishlistItemRepository.remove(item);
    return this.getWishlist(userId);
  }

  /**
   * Resolve a wishlist row strictly through the caller's own userId. Rows
   * belonging to other users are indistinguishable from missing ones (404).
   */
  private async findOwnedItem(userId: string, productId: string): Promise<WishlistItem> {
    const item = await this.wishlistItemRepository.findOne({
      where: { userId, productId },
    });
    if (!item) {
      throw new NotFoundException('Wishlist item not found');
    }
    return item;
  }

  private async findItems(userId: string): Promise<WishlistItem[]> {
    return this.wishlistItemRepository.find({
      where: { userId },
      relations: ['product', 'product.images', 'product.sizes'],
      order: { createdAt: 'DESC' },
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    const pgCode =
      error instanceof QueryFailedError
        ? (error.driverError as { code?: string } | undefined)?.code
        : undefined;
    return pgCode === UNIQUE_VIOLATION;
  }

  /** Map to the shared contract with LIVE product data. */
  private toDto(items: WishlistItem[]): WishlistDto {
    const dtoItems: WishlistItemDto[] = items
      .filter((item) => !!item.product)
      .map((item) => {
        const primaryImage =
          item.product.images?.find((img) => img.isPrimary) ?? item.product.images?.[0];
        return {
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          price: Number(item.product.price),
          currency: item.product.currency,
          stockQuantity: item.product.stockQuantity,
          hasSizes: (item.product.sizes?.length ?? 0) > 0,
          imageUrl: primaryImage?.url,
          addedAt: item.createdAt.toISOString(),
        };
      });

    return {
      items: dtoItems,
      itemCount: dtoItems.length,
    };
  }
}
