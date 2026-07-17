import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the append-only analytics_events table for the bespoke first-party
 * event stream (Analytics 1 spec). Bare uuid columns only — NO FK relations,
 * so events survive product/order/vendor deletion and this table is never
 * join-loaded from the OLTP path. Reuses the existing "currency_code" enum
 * (created in InitialSchema) rather than creating a new type. NO PII columns.
 */
export class AnalyticsEvents1784246400000 implements MigrationInterface {
  name = 'AnalyticsEvents1784246400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "analytics_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "type" character varying NOT NULL,
        "sessionId" character varying(64) NOT NULL,
        "userId" uuid,
        "productId" uuid,
        "vendorId" uuid,
        "orderId" uuid,
        "value" numeric(12,2),
        "currency" "currency_code",
        "metadata" jsonb,
        "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_analytics_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_events_type" ON "analytics_events" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_events_sessionId" ON "analytics_events" ("sessionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_events_vendorId" ON "analytics_events" ("vendorId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_analytics_events_vendorId"`);
    await queryRunner.query(`DROP INDEX "IDX_analytics_events_sessionId"`);
    await queryRunner.query(`DROP INDEX "IDX_analytics_events_type"`);
    await queryRunner.query(`DROP TABLE "analytics_events"`);
    // Never drop "currency_code" — it is the shared enum, owned by InitialSchema.
  }
}
