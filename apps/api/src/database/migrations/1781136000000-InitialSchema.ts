import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema, hand-written to match the entities exactly
 * (synchronize is off everywhere — all schema changes go through migrations).
 */
export class InitialSchema1781136000000 implements MigrationInterface {
  name = 'InitialSchema1781136000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enum types (shared across tables via enumName) ──
    await queryRunner.query(`CREATE TYPE "user_role" AS ENUM ('customer', 'vendor', 'admin')`);
    await queryRunner.query(
      `CREATE TYPE "vendor_status" AS ENUM ('pending', 'approved', 'rejected', 'suspended')`,
    );
    await queryRunner.query(`CREATE TYPE "country_code" AS ENUM ('ZA', 'NA')`);
    await queryRunner.query(`CREATE TYPE "currency_code" AS ENUM ('ZAR', 'NAD')`);
    await queryRunner.query(`CREATE TYPE "listing_type" AS ENUM ('platform', 'vendor')`);
    await queryRunner.query(
      `CREATE TYPE "order_status" AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payment_status" AS ENUM ('pending', 'authorized', 'paid', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TYPE "shipment_status" AS ENUM ('pending', 'booked', 'in_transit', 'at_border', 'customs_cleared', 'out_for_delivery', 'delivered', 'failed')`,
    );

    // ── users ──
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying NOT NULL,
        "password" character varying NOT NULL,
        "role" "user_role" NOT NULL DEFAULT 'customer',
        "isActive" boolean NOT NULL DEFAULT true,
        "firstName" character varying,
        "lastName" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "currentRefreshToken" character varying,
        "currentRefreshTokenExp" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // ── vendors ──
    await queryRunner.query(`
      CREATE TABLE "vendors" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "businessName" character varying NOT NULL,
        "tradingName" character varying,
        "registrationNumber" character varying,
        "website" character varying,
        "description" character varying,
        "status" "vendor_status" NOT NULL DEFAULT 'pending',
        "countryCode" "country_code" NOT NULL DEFAULT 'ZA',
        "verificationDocumentUrl" character varying,
        "userId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_vendors_businessName" UNIQUE ("businessName"),
        CONSTRAINT "UQ_vendors_userId" UNIQUE ("userId"),
        CONSTRAINT "PK_vendors" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vendors_user" FOREIGN KEY ("userId") REFERENCES "users"("id")
      )
    `);

    // ── categories ──
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "slug" character varying,
        "description" character varying,
        "displayOrder" integer NOT NULL DEFAULT 0,
        "parentId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_categories_name" UNIQUE ("name"),
        CONSTRAINT "UQ_categories_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_categories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_categories_parent" FOREIGN KEY ("parentId") REFERENCES "categories"("id")
      )
    `);

    // ── products ──
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "description" character varying NOT NULL,
        "price" numeric(12,2) NOT NULL,
        "currency" "currency_code" NOT NULL DEFAULT 'ZAR',
        "stockQuantity" integer NOT NULL DEFAULT 0,
        "originCountry" "country_code" NOT NULL DEFAULT 'ZA',
        "listingType" "listing_type" NOT NULL DEFAULT 'vendor',
        "vendorId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_vendor" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id"),
        CONSTRAINT "CHK_products_listing_vendor" CHECK (
          ("listingType" = 'vendor' AND "vendorId" IS NOT NULL)
          OR ("listingType" = 'platform' AND "vendorId" IS NULL)
        )
      )
    `);

    // ── product_images ──
    await queryRunner.query(`
      CREATE TABLE "product_images" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "url" character varying NOT NULL,
        "key" character varying,
        "isPrimary" boolean NOT NULL DEFAULT false,
        "displayOrder" integer NOT NULL DEFAULT 0,
        "altText" character varying,
        "productId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_images" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_images_product" FOREIGN KEY ("productId")
          REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    // ── product_categories (join table) ──
    await queryRunner.query(`
      CREATE TABLE "product_categories" (
        "productId" uuid NOT NULL,
        "categoryId" uuid NOT NULL,
        CONSTRAINT "PK_product_categories" PRIMARY KEY ("productId", "categoryId"),
        CONSTRAINT "FK_product_categories_product" FOREIGN KEY ("productId")
          REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_product_categories_category" FOREIGN KEY ("categoryId")
          REFERENCES "categories"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_product_categories_productId" ON "product_categories" ("productId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_categories_categoryId" ON "product_categories" ("categoryId")`,
    );

    // ── addresses ──
    await queryRunner.query(`
      CREATE TABLE "addresses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "recipientName" character varying NOT NULL,
        "line1" character varying NOT NULL,
        "line2" character varying,
        "city" character varying NOT NULL,
        "region" character varying,
        "postalCode" character varying,
        "countryCode" "country_code" NOT NULL,
        "phone" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_addresses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_addresses_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ── carts / cart_items ──
    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_carts_userId" UNIQUE ("userId"),
        CONSTRAINT "PK_carts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_carts_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "cartId" uuid NOT NULL,
        "productId" uuid NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cart_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cart_items_cart" FOREIGN KEY ("cartId")
          REFERENCES "carts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cart_items_product" FOREIGN KEY ("productId")
          REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    // ── orders / order_items ──
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "status" "order_status" NOT NULL DEFAULT 'pending',
        "currency" "currency_code" NOT NULL DEFAULT 'ZAR',
        "subtotal" numeric(12,2) NOT NULL DEFAULT 0,
        "shippingTotal" numeric(12,2) NOT NULL DEFAULT 0,
        "total" numeric(12,2) NOT NULL DEFAULT 0,
        "originCountry" "country_code" NOT NULL DEFAULT 'ZA',
        "destinationCountry" "country_code" NOT NULL,
        "shippingAddressId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_orders_user" FOREIGN KEY ("userId") REFERENCES "users"("id"),
        CONSTRAINT "FK_orders_shippingAddress" FOREIGN KEY ("shippingAddressId")
          REFERENCES "addresses"("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "orderId" uuid NOT NULL,
        "productId" uuid,
        "productName" character varying NOT NULL,
        "unitPrice" numeric(12,2) NOT NULL,
        "currency" "currency_code" NOT NULL DEFAULT 'ZAR',
        "quantity" integer NOT NULL,
        "listingType" "listing_type" NOT NULL DEFAULT 'vendor',
        "vendorId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_items_order" FOREIGN KEY ("orderId")
          REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_items_product" FOREIGN KEY ("productId")
          REFERENCES "products"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_order_items_vendor" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id")
      )
    `);

    // ── payments ──
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "orderId" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" "currency_code" NOT NULL DEFAULT 'ZAR',
        "status" "payment_status" NOT NULL DEFAULT 'pending',
        "provider" character varying NOT NULL DEFAULT 'stub',
        "providerRef" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payments_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id")
      )
    `);

    // ── shipments ──
    await queryRunner.query(`
      CREATE TABLE "shipments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "orderId" uuid NOT NULL,
        "provider" character varying NOT NULL DEFAULT 'stub',
        "trackingReference" character varying,
        "status" "shipment_status" NOT NULL DEFAULT 'pending',
        "fromCountry" "country_code" NOT NULL DEFAULT 'ZA',
        "toCountry" "country_code" NOT NULL,
        "customsReference" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shipments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_shipments_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "shipments"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TABLE "cart_items"`);
    await queryRunner.query(`DROP TABLE "carts"`);
    await queryRunner.query(`DROP TABLE "addresses"`);
    await queryRunner.query(`DROP INDEX "IDX_product_categories_categoryId"`);
    await queryRunner.query(`DROP INDEX "IDX_product_categories_productId"`);
    await queryRunner.query(`DROP TABLE "product_categories"`);
    await queryRunner.query(`DROP TABLE "product_images"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP TABLE "vendors"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "shipment_status"`);
    await queryRunner.query(`DROP TYPE "payment_status"`);
    await queryRunner.query(`DROP TYPE "order_status"`);
    await queryRunner.query(`DROP TYPE "listing_type"`);
    await queryRunner.query(`DROP TYPE "currency_code"`);
    await queryRunner.query(`DROP TYPE "country_code"`);
    await queryRunner.query(`DROP TYPE "vendor_status"`);
    await queryRunner.query(`DROP TYPE "user_role"`);
  }
}
