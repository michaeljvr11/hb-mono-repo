import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the admin-editable search_synonyms table (card #49) and seeds an
 * initial curated ZA/NA list so the Meilisearch synonyms setting is not
 * empty on first boot: spelling variants (moisturiser/moisturizer),
 * SPF/sunscreen, British/American spelling (colour/color), and a couple of
 * South African vendor/product-domain aliases.
 */
export class SearchSynonyms1783440000000 implements MigrationInterface {
  name = 'SearchSynonyms1783440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "search_synonyms" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "term" character varying NOT NULL,
        "equivalents" text array NOT NULL,
        "bidirectional" boolean NOT NULL DEFAULT true,
        "enabled" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_search_synonyms_term" UNIQUE ("term"),
        CONSTRAINT "PK_search_synonyms" PRIMARY KEY ("id")
      )
    `);

    // Curated seed list — bidirectional by default (moisturiser <-> moisturizer).
    await queryRunner.query(`
      INSERT INTO "search_synonyms" ("term", "equivalents", "bidirectional") VALUES
        ('moisturiser', ARRAY['moisturizer'], true),
        ('spf', ARRAY['sunscreen', 'sunblock'], true),
        ('colour', ARRAY['color'], true),
        ('rooibos', ARRAY['redbush', 'red bush tea'], true),
        ('takkies', ARRAY['sneakers', 'trainers'], true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "search_synonyms"`);
  }
}
