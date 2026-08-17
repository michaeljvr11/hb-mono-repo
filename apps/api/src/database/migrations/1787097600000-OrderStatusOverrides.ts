import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `order_status_overrides` (vault: "Order State Machine" §
 * "Admin override", confirmed 2026-08-16). This is a dedicated audit table,
 * separate from the generic `audit_logs` table (`AuditService`) — every
 * admin status override is recorded here unconditionally, regardless of
 * `sendNotifications`.
 *
 * The admin-override write path bypasses `ORDER_STATUS_TRANSITIONS` entirely
 * (any `order_status` to any `order_status`, including re-entering/leaving
 * terminal states), so `fromStatus`/`toStatus` reuse the existing
 * `order_status` enum type but carry no CHECK constraint against the
 * transition matrix — that matrix's guarantee is scoped to the normal
 * (vendor/customer/automatic) write path only.
 *
 * Unlike the generic, polymorphic `audit_logs` table, this table always
 * references exactly one order and one admin user, so both are real FKs
 * (`wishlist_items` precedent) — `ON DELETE RESTRICT` on both, since an
 * audit trail must outlive the row it references, never silently vanish or
 * cascade-delete alongside it.
 */
export class OrderStatusOverrides1787097600000 implements MigrationInterface {
  name = 'OrderStatusOverrides1787097600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "order_status_overrides" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "orderId" uuid NOT NULL,
        "adminUserId" uuid NOT NULL,
        "fromStatus" "order_status" NOT NULL,
        "toStatus" "order_status" NOT NULL,
        "reason" character varying(2000) NOT NULL,
        "sendNotifications" boolean NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_status_overrides" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_status_overrides_order" FOREIGN KEY ("orderId")
          REFERENCES "orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_order_status_overrides_admin" FOREIGN KEY ("adminUserId")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_order_status_overrides_orderId" ON "order_status_overrides" ("orderId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_order_status_overrides_orderId"`);
    await queryRunner.query(`DROP TABLE "order_status_overrides"`);
  }
}
