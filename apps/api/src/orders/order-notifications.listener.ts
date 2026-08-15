import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderEvents } from '../common/events/domain-events';
import type { OrderPaidEvent } from '../common/events/domain-events';
import { VendorsService } from '../vendors/vendors.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { MailService } from '../mail/mail.service';

const RELATIONS = ['items', 'items.vendor', 'items.vendor.user', 'user'];

/**
 * Sends the paid-and-confirmed transactional emails triggered by
 * {@link OrderEvents.PAID}: one per distinct vendor on the order (that
 * vendor's lines only) + exactly one platform-ops email (full line list +
 * order total, to every configured recipient) + exactly one customer
 * confirmation email (full line list + order total, to the ordering
 * customer — TE-5).
 *
 * Best-effort, non-blocking — modelled on SearchIndexerService's
 * reload-by-id + `safely()` shape, but see the OrderEvents doc comment:
 * unlike search indexing there is no daily-reindex-style safety net here.
 * Every send (including per-vendor sends within the same event) is isolated
 * so one failure never prevents another recipient's email from going out.
 */
@Injectable()
export class OrderNotificationsListener {
  private readonly logger = new Logger(OrderNotificationsListener.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
    private readonly vendorsService: VendorsService,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent(OrderEvents.PAID)
  async handleOrderPaid(event: OrderPaidEvent): Promise<void> {
    await this.safely(`order.paid ${event.orderId}`, async () => {
      const order = await this.orderRepository.findOne({
        where: { id: event.orderId },
        relations: RELATIONS,
      });
      // Deleted between event emission and processing — nothing to notify.
      if (!order) return;

      const items = order.items ?? [];
      const vendorLines = new Map<string, OrderItem[]>();
      for (const item of items) {
        if (!item.vendorId) continue; // platform line — no individual vendor email
        const lines = vendorLines.get(item.vendorId) ?? [];
        lines.push(item);
        vendorLines.set(item.vendorId, lines);
      }

      for (const [vendorId, lines] of vendorLines) {
        await this.notifyVendor(order, vendorId, lines);
      }

      await this.notifyPlatform(order, items);
      await this.notifyCustomer(order, items);
    });
  }

  // ── Per-recipient-type sends ────────────────────────────────────────────

  private async notifyVendor(order: Order, vendorId: string, lines: OrderItem[]): Promise<void> {
    await this.safely(`order.paid ${order.id} vendor ${vendorId}`, async () => {
      const email = await this.vendorsService.resolveNotificationEmail(vendorId);
      if (!email) {
        this.logger.warn(
          `No notification email resolved for vendor ${vendorId} on order ${order.id} — skipping`,
        );
        return;
      }

      const businessName = lines[0]?.vendor?.businessName ?? 'your store';
      await this.mailService.sendVendorOrderNotification(
        email,
        businessName,
        order.id,
        lines.map((line) => ({
          productName: line.productName,
          unitPrice: Number(line.unitPrice),
          currency: line.currency,
          quantity: line.quantity,
        })),
      );
    });
  }

  private async notifyPlatform(order: Order, items: OrderItem[]): Promise<void> {
    await this.safely(`order.paid ${order.id} platform`, async () => {
      const { notificationEmails } = await this.platformSettingsService.get();
      if (!notificationEmails.length) {
        this.logger.warn(
          `No platform notification recipients configured — skipping order ${order.id}`,
        );
        return;
      }

      await this.mailService.sendPlatformOrderNotification(
        notificationEmails,
        order.id,
        items.map((line) => ({
          productName: line.productName,
          unitPrice: Number(line.unitPrice),
          currency: line.currency,
          quantity: line.quantity,
          vendorId: line.vendorId ?? undefined,
        })),
        Number(order.total),
        order.currency,
      );
    });
  }

  private async notifyCustomer(order: Order, items: OrderItem[]): Promise<void> {
    await this.safely(`order.paid ${order.id} customer`, async () => {
      const recipientName = order.user?.firstName ?? 'there';
      await this.mailService.sendCustomerOrderConfirmation(
        order.user.email,
        recipientName,
        order.id,
        items.map((line) => ({
          productName: line.productName,
          unitPrice: Number(line.unitPrice),
          currency: line.currency,
          quantity: line.quantity,
        })),
        Number(order.total),
        order.currency,
      );
    });
  }

  private async safely(label: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      // Never let a notification failure escape this listener — see the
      // OrderEvents doc comment for why there is no safety-net retry here.
      this.logger.error(`Order notification failed (${label}): ${(error as Error).message}`);
    }
  }
}
