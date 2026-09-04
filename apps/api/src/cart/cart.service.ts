import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CartDto, CartItemDto, CartTotalDto, CurrencyCode } from '@hb/shared';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { Product } from '../products/entities/product.entity';
import { ProductSize } from '../products/entities/product-size.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

/**
 * Cart line identity is `(productId, productSizeId)` — `null`/`undefined` on
 * both sides still counts as a match (unsized products). Kept as a named
 * predicate rather than inlined so `addItem`'s merge check and any future
 * caller can't drift on the null/undefined-equivalence rule.
 */
function sameSize(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

/**
 * Clamp a requested quantity to the live available stock.
 * The cart never promises more units than the product can currently supply;
 * the hard guarantee still lives in the order-creation transaction (which
 * re-checks under a row lock).
 */
export function clampQuantity(requested: number, stockQuantity: number): number {
  return Math.max(0, Math.min(requested, stockQuantity));
}

/**
 * Server-side cart for authenticated users. The cart stores product refs +
 * quantity ONLY — never money. Prices are read live from `products` whenever
 * the cart is displayed or checked out (the cart is a staging area, not a
 * past total; price snapshotting happens at order creation).
 *
 * Ownership: every read/write resolves the cart by the caller's userId — a
 * user can never see or touch another user's cart or items. An item id that
 * doesn't belong to the caller's cart is a plain 404 (no existence leak).
 */
@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async getCart(userId: string): Promise<CartDto> {
    const cart = await this.getOrCreateCart(userId);
    return this.toDto(cart);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartDto> {
    const product = await this.productRepository.findOne({
      where: { id: dto.productId },
      relations: ['sizes'],
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const hasSizes = !!product.sizes?.length;
    let size: ProductSize | undefined;

    if (hasSizes) {
      if (!dto.productSizeId) {
        throw new BadRequestException('productSizeId is required for this product');
      }
      const match = product.sizes.find((s) => s.id === dto.productSizeId);
      if (!match) {
        throw new NotFoundException('Size not found for this product');
      }
      size = match;
    } else if (dto.productSizeId) {
      throw new BadRequestException('This product does not have sizes');
    }

    const availableStock = size ? size.stockQuantity : product.stockQuantity;
    if (availableStock < 1) {
      throw new ConflictException(
        size
          ? `'${product.name}' (${size.label}) is out of stock`
          : `'${product.name}' is out of stock`,
      );
    }

    const cart = await this.getOrCreateCart(userId);
    const existing = cart.items.find(
      (item) => item.productId === dto.productId && sameSize(item.productSizeId, dto.productSizeId),
    );

    if (existing) {
      existing.quantity = clampQuantity(existing.quantity + dto.quantity, availableStock);
      await this.cartItemRepository.save(existing);
    } else {
      const item = this.cartItemRepository.create({
        cartId: cart.id,
        productId: dto.productId,
        productSizeId: size?.id,
        quantity: clampQuantity(dto.quantity, availableStock),
      });
      await this.cartItemRepository.save(item);
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto): Promise<CartDto> {
    const item = await this.findOwnedItem(userId, itemId);
    const availableStock = item.productSize
      ? item.productSize.stockQuantity
      : item.product.stockQuantity;

    if (availableStock < 1) {
      throw new ConflictException(`'${item.product.name}' is out of stock`);
    }

    item.quantity = clampQuantity(dto.quantity, availableStock);
    await this.cartItemRepository.save(item);

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<CartDto> {
    const item = await this.findOwnedItem(userId, itemId);
    await this.cartItemRepository.remove(item);
    return this.getCart(userId);
  }

  /**
   * Resolve a cart item strictly through the caller's own cart. Items in
   * other users' carts are indistinguishable from missing ones (404).
   */
  private async findOwnedItem(userId: string, itemId: string): Promise<CartItem> {
    const item = await this.cartItemRepository.findOne({
      where: { id: itemId, cart: { userId } },
      relations: ['cart', 'product', 'productSize'],
    });
    if (!item) {
      throw new NotFoundException('Cart item not found');
    }
    return item;
  }

  private async getOrCreateCart(userId: string): Promise<Cart> {
    const existing = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items', 'items.product', 'items.productSize'],
      order: { items: { createdAt: 'ASC' } },
    });
    if (existing) {
      return existing;
    }
    const cart = this.cartRepository.create({ userId, items: [] });
    return this.cartRepository.save(cart);
  }

  /**
   * Map to the shared contract with LIVE product data. Line totals and
   * per-currency subtotals are computed in integer cents so display totals
   * never pick up float drift. ZAR and NAD are never summed together.
   */
  private toDto(cart: Cart): CartDto {
    const items: CartItemDto[] = (cart.items ?? [])
      .filter((item) => !!item.product)
      .map((item) => {
        const unitPrice = Number(item.product.price);
        const unitCents = Math.round(unitPrice * 100);
        const primaryImage =
          item.product.images?.find((img) => img.isPrimary) ?? item.product.images?.[0];
        // Sized lines read stock/label live off the currently-linked ProductSize
        // (nulled by ON DELETE SET NULL if the size was since removed — the
        // line then falls back to the unsized/Product path automatically).
        const stockQuantity = item.productSize
          ? item.productSize.stockQuantity
          : item.product.stockQuantity;
        return {
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          productName: item.product.name,
          unitPrice,
          currency: item.product.currency,
          stockQuantity,
          imageUrl: primaryImage?.url,
          lineTotal: (unitCents * item.quantity) / 100,
          productSizeId: item.productSizeId ?? undefined,
          sizeLabel: item.productSize?.label,
        };
      });

    const centsByCurrency = new Map<CurrencyCode, number>();
    for (const item of items) {
      const cents = Math.round(item.lineTotal * 100);
      centsByCurrency.set(item.currency, (centsByCurrency.get(item.currency) ?? 0) + cents);
    }
    const totals: CartTotalDto[] = Array.from(centsByCurrency.entries()).map(
      ([currency, cents]) => ({ currency, subtotal: cents / 100 }),
    );

    return {
      id: cart.id,
      items,
      totals,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      updatedAt: cart.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}
