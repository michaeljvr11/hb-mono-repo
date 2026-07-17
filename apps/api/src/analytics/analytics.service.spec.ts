import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsEventType, CurrencyCode } from '@hb/shared';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { CreateAnalyticsEventDto } from './dto/create-analytics-event.dto';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OCCURRED_AT = new Date('2026-07-17T09:00:00.000Z');
const RECEIVED_AT = new Date('2026-07-17T09:00:01.000Z');

function makeDto(overrides: Partial<CreateAnalyticsEventDto> = {}): CreateAnalyticsEventDto {
  const dto = new CreateAnalyticsEventDto();
  Object.assign(dto, {
    type: AnalyticsEventType.PRODUCT_VIEWED,
    sessionId: 'session-abc-123',
    occurredAt: OCCURRED_AT.toISOString(),
    ...overrides,
  });
  return dto;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let repo: Record<string, jest.Mock>;

  beforeEach(async () => {
    repo = { create: jest.fn(), save: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(AnalyticsEvent), useValue: repo },
      ],
    }).compile();

    service = module.get(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── ingest — persistence + shape ────────────────────────────────────────

  describe('ingest', () => {
    it('persists a non-monetary event with userId always null and returns the stored dto', async () => {
      const dto = makeDto();
      const entity = {
        id: 'evt-1',
        type: dto.type,
        sessionId: dto.sessionId,
        userId: null,
        productId: null,
        vendorId: null,
        orderId: null,
        value: null,
        currency: null,
        metadata: null,
        occurredAt: OCCURRED_AT,
        receivedAt: RECEIVED_AT,
      };
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      const result = await service.ingest(dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null, type: AnalyticsEventType.PRODUCT_VIEWED }),
      );
      expect(result).toEqual({
        id: 'evt-1',
        type: AnalyticsEventType.PRODUCT_VIEWED,
        sessionId: dto.sessionId,
        productId: undefined,
        vendorId: undefined,
        orderId: undefined,
        value: undefined,
        currency: undefined,
        metadata: undefined,
        occurredAt: OCCURRED_AT.toISOString(),
        receivedAt: RECEIVED_AT.toISOString(),
      });
      expect((result as unknown as Record<string, unknown>).userId).toBeUndefined();
    });

    // ─── money path ──────────────────────────────────────────────────────

    it('stores value + currency together and round-trips value as a number', async () => {
      const dto = makeDto({
        type: AnalyticsEventType.ORDER_COMPLETED,
        value: 249.99,
        currency: CurrencyCode.ZAR,
        orderId: 'order-1',
      });
      const entity = {
        id: 'evt-2',
        type: dto.type,
        sessionId: dto.sessionId,
        userId: null,
        productId: null,
        vendorId: null,
        orderId: 'order-1',
        // pg numeric(12,2) round-trips as a string
        value: '249.99' as never,
        currency: CurrencyCode.ZAR,
        metadata: null,
        occurredAt: OCCURRED_AT,
        receivedAt: RECEIVED_AT,
      };
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      const result = await service.ingest(dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ value: 249.99, currency: CurrencyCode.ZAR }),
      );
      expect(result.value).toBe(249.99);
      expect(typeof result.value).toBe('number');
      expect(result.currency).toBe(CurrencyCode.ZAR);
    });

    it('maps occurredAt (client clock) and receivedAt (server clock) to distinct ISO strings', async () => {
      const dto = makeDto();
      const entity = {
        id: 'evt-3',
        type: dto.type,
        sessionId: dto.sessionId,
        userId: null,
        productId: null,
        vendorId: null,
        orderId: null,
        value: null,
        currency: null,
        metadata: null,
        occurredAt: OCCURRED_AT,
        receivedAt: RECEIVED_AT,
      };
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      const result = await service.ingest(dto);

      expect(result.occurredAt).toBe(OCCURRED_AT.toISOString());
      expect(result.receivedAt).toBe(RECEIVED_AT.toISOString());
      expect(result.occurredAt).not.toBe(result.receivedAt);
    });

    it('passes optional productId/vendorId/metadata through to create()', async () => {
      const dto = makeDto({
        type: AnalyticsEventType.ADD_TO_CART,
        productId: 'prod-1',
        vendorId: 'vendor-1',
        metadata: { source: 'search' },
      });
      const entity = {
        id: 'evt-4',
        type: dto.type,
        sessionId: dto.sessionId,
        userId: null,
        productId: 'prod-1',
        vendorId: 'vendor-1',
        orderId: null,
        value: null,
        currency: null,
        metadata: { source: 'search' },
        occurredAt: OCCURRED_AT,
        receivedAt: RECEIVED_AT,
      };
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      const result = await service.ingest(dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          vendorId: 'vendor-1',
          metadata: { source: 'search' },
        }),
      );
      expect(result.productId).toBe('prod-1');
      expect(result.vendorId).toBe('vendor-1');
      expect(result.metadata).toEqual({ source: 'search' });
    });
  });
});
