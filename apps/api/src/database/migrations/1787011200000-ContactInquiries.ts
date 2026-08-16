import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `contact_inquiries` (LSM-5 — `POST /inquiries`, the hb-landing
 * contact-form endpoint). A lead, not an order: no money, no inventory, no
 * order state, no user relation — submitters are anonymous and the row is
 * never updated after creation. Persisted first, notified second (see
 * InquiriesService), so a Resend outage never loses a lead.
 *
 * Column widths mirror `CreateContactInquiryDto`'s `@MaxLength` values
 * exactly — this is an unauthenticated write path, so both layers cap
 * free-text input against storage abuse.
 */
export class ContactInquiries1787011200000 implements MigrationInterface {
  name = 'ContactInquiries1787011200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "inquiry_order_type" AS ENUM ('recurring_order', 'one_time_order', 'other')`,
    );

    await queryRunner.query(`
      CREATE TABLE "contact_inquiries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(200) NOT NULL,
        "email" character varying(255) NOT NULL,
        "phone" character varying(50),
        "orderType" "inquiry_order_type" NOT NULL,
        "referenceNumber" character varying(100),
        "message" character varying(5000) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contact_inquiries" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "contact_inquiries"`);
    await queryRunner.query(`DROP TYPE "inquiry_order_type"`);
  }
}
