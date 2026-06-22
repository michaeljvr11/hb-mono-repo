import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the append-only audit_logs table used to record privileged admin
 * actions (role changes, vendor status transitions, product mutations, etc.).
 * metadata is jsonb so callers can store arbitrary structured context without
 * schema changes. All four filter columns are individually indexed to keep
 * the admin query endpoint fast at scale.
 */
export class AuditLog1782086400000 implements MigrationInterface {
  name = 'AuditLog1782086400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid,
        "action" character varying NOT NULL,
        "entityType" character varying NOT NULL,
        "entityId" character varying NOT NULL,
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_userId" ON "audit_logs" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_action" ON "audit_logs" ("action")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entityType" ON "audit_logs" ("entityType")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_createdAt" ON "audit_logs" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_entityType"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_action"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_userId"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
  }
}
