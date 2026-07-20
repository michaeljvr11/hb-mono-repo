import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEventDto } from '@hb/shared';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { CreateAnalyticsEventDto } from './dto/create-analytics-event.dto';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsEventRepository: Repository<AnalyticsEvent>,
  ) {}

  /**
   * Persists one event and returns its stored shape. `userId` is never taken
   * from the request (client-supplied user ids are spoofable) — it is always
   * stored null, reserved for a later authenticated-attribution slice.
   */
  async ingest(dto: CreateAnalyticsEventDto): Promise<AnalyticsEventDto> {
    const event = this.analyticsEventRepository.create({
      type: dto.type,
      sessionId: dto.sessionId,
      userId: null,
      productId: dto.productId ?? null,
      vendorId: dto.vendorId ?? null,
      orderId: dto.orderId ?? null,
      value: dto.value ?? null,
      currency: dto.currency ?? null,
      metadata: dto.metadata ?? null,
      occurredAt: new Date(dto.occurredAt),
    });

    const saved = await this.analyticsEventRepository.save(event);
    return this.toDto(saved);
  }

  private toDto(event: AnalyticsEvent): AnalyticsEventDto {
    return {
      id: event.id,
      type: event.type,
      sessionId: event.sessionId,
      productId: event.productId ?? undefined,
      vendorId: event.vendorId ?? undefined,
      orderId: event.orderId ?? undefined,
      // numeric(12,2) round-trips as a string on some drivers/paths — normalize to number.
      value: event.value !== null && event.value !== undefined ? Number(event.value) : undefined,
      currency: event.currency ?? undefined,
      metadata: event.metadata ?? undefined,
      occurredAt: event.occurredAt.toISOString(),
      receivedAt: event.receivedAt.toISOString(),
    };
  }
}
