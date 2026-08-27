import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `users.termsAcceptedAt` (LC-10).
 *
 * LC-3 recorded signup consent only through `AuditService.log`, which is
 * deliberately best-effort: it catches its own errors and logs a warning so a
 * transient DB failure never breaks the business action that called it. Right
 * for privileged-action telemetry, too weak for a consent record — a swallowed
 * write left a live account with no provable acceptance and nothing surfacing
 * that it had happened.
 *
 * The column is written in the same INSERT as the account row, so the
 * acceptance and the account succeed or fail together with no transaction
 * plumbing across UsersService and AuditService.
 *
 * Nullable on purpose, and NOT backfilled. A null means "this account has no
 * acceptance record" — accounts predating this migration, and Google OAuth
 * accounts, which do not pass through register(). Stamping every existing row
 * with a timestamp would manufacture consent that was never given, which is
 * worse than an honest null. Existing accounts are grandfathered by an
 * explicit owner decision recorded on card LC-9; nothing is deployed yet, so
 * every row that exists today is dev/test data.
 */
export class UserTermsAcceptedAt1788172800000 implements MigrationInterface {
  name = 'UserTermsAcceptedAt1788172800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "termsAcceptedAt" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "termsAcceptedAt"`);
  }
}
