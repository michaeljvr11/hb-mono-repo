import 'dotenv/config';
import { CountryCode, CurrencyCode, ListingType, VendorStatus } from '@hb/shared';
import { Category } from '../categories/entities/category.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Product } from '../products/entities/product.entity';
import dataSource from './data-source';

async function main() {
  await dataSource.initialize();

  try {
    const categoryRepo = dataSource.getRepository(Category);
    const vendorRepo = dataSource.getRepository(Vendor);
    const productRepo = dataSource.getRepository(Product);

    // Idempotency guard — skip entirely if categories already exist.
    const existingCount = await categoryRepo.count();
    if (existingCount > 0) {
      console.log('Seed skipped — data already present');
      return;
    }

    // ------------------------------------------------------------------ //
    // Categories
    // ------------------------------------------------------------------ //
    const categoryDefs = [
      {
        name: 'Agriculture',
        slug: 'agriculture',
        description: 'Farm produce and agri-products from southern Africa.',
        displayOrder: 0,
      },
      {
        name: 'Handicrafts',
        slug: 'handicrafts',
        description: 'Hand-made artisan goods and traditional crafts.',
        displayOrder: 1,
      },
      {
        name: 'Health & Beauty',
        slug: 'health-beauty',
        description: 'Natural wellness, skincare and beauty products.',
        displayOrder: 2,
      },
      {
        name: 'Textiles',
        slug: 'textiles',
        description: 'Woven fabrics, garments and textile arts.',
        displayOrder: 3,
      },
    ];

    const savedCategories = await categoryRepo.save(
      categoryDefs.map((def) => categoryRepo.create(def)),
    );

    const [agriculture, handicrafts, healthBeauty, textiles] = savedCategories;

    // ------------------------------------------------------------------ //
    // Vendors (all APPROVED, no user account)
    // ------------------------------------------------------------------ //
    const vendorDefs = [
      {
        businessName: 'Roots & Shoots Art',
        tradingName: 'Roots & Shoots',
        description:
          'Cape Town-based collective producing hand-painted pottery and mixed-media wall art.',
        status: VendorStatus.APPROVED,
        countryCode: CountryCode.SOUTH_AFRICA,
      },
      {
        businessName: 'Leko Organics',
        tradingName: 'Leko Organics',
        description: 'Organic dried-fruit, nut and seed products from the Western Cape.',
        status: VendorStatus.APPROVED,
        countryCode: CountryCode.SOUTH_AFRICA,
      },
      {
        businessName: 'Zulu Weaves',
        tradingName: 'Zulu Weaves',
        description: 'Traditional Zulu basket-weaving and textile atelier based in KwaZulu-Natal.',
        status: VendorStatus.APPROVED,
        countryCode: CountryCode.SOUTH_AFRICA,
      },
      {
        businessName: 'Kalahari Naturals',
        tradingName: 'Kalahari Naturals',
        description: 'Namibian botanical skincare brand using indigenous Kalahari plant extracts.',
        status: VendorStatus.APPROVED,
        countryCode: CountryCode.NAMIBIA,
      },
    ];

    const savedVendors = await vendorRepo.save(vendorDefs.map((def) => vendorRepo.create(def)));

    const [rootsShoots, lekoOrganics, zuluWeaves, kalahari] = savedVendors;

    // ------------------------------------------------------------------ //
    // Products
    // Invariant: VENDOR listings MUST have a vendorId, PLATFORM MUST NOT.
    // ------------------------------------------------------------------ //
    const productDefs: Partial<Product>[] = [
      // --- Vendor listings ---
      {
        name: 'Hand-Painted Ceramic Bowl',
        description:
          'Individually wheel-thrown and hand-painted ceramic bowl. Food-safe glaze, each piece unique.',
        price: 349.0,
        currency: CurrencyCode.ZAR,
        stockQuantity: 20,
        originCountry: CountryCode.SOUTH_AFRICA,
        listingType: ListingType.VENDOR,
        vendor: rootsShoots,
        vendorId: rootsShoots.id,
        categories: [handicrafts],
      },
      {
        name: 'Mixed-Media Canvas Print',
        description:
          'A3 limited-edition mixed-media print on heavyweight cotton canvas, signed by the artist.',
        price: 780.0,
        currency: CurrencyCode.ZAR,
        stockQuantity: 12,
        originCountry: CountryCode.SOUTH_AFRICA,
        listingType: ListingType.VENDOR,
        vendor: rootsShoots,
        vendorId: rootsShoots.id,
        categories: [handicrafts],
      },
      {
        name: 'Organic Dried-Fruit Hamper',
        description:
          'Assorted sulphur-free dried apricots, figs and mango slices — 500 g gift box.',
        price: 210.0,
        currency: CurrencyCode.ZAR,
        stockQuantity: 50,
        originCountry: CountryCode.SOUTH_AFRICA,
        listingType: ListingType.VENDOR,
        vendor: lekoOrganics,
        vendorId: lekoOrganics.id,
        categories: [agriculture],
      },
      {
        name: 'Raw Macadamia & Pecan Mix',
        description:
          'Cold-pressed macadamia and pecan blend, lightly salted, 300 g resealable pouch.',
        price: 155.0,
        currency: CurrencyCode.ZAR,
        stockQuantity: 80,
        originCountry: CountryCode.SOUTH_AFRICA,
        listingType: ListingType.VENDOR,
        vendor: lekoOrganics,
        vendorId: lekoOrganics.id,
        categories: [agriculture],
      },
      {
        name: 'Zulu Ukhamba Beer Basket',
        description:
          'Traditional Zulu ilala-palm ukhamba basket — handwoven by certified artisans, 30 cm diameter.',
        price: 495.0,
        currency: CurrencyCode.ZAR,
        stockQuantity: 15,
        originCountry: CountryCode.SOUTH_AFRICA,
        listingType: ListingType.VENDOR,
        vendor: zuluWeaves,
        vendorId: zuluWeaves.id,
        categories: [handicrafts, textiles],
      },
      {
        name: 'Woven Ndebele Table Runner',
        description: 'Geometric Ndebele-pattern table runner, 180 × 35 cm, cotton-blend yarn.',
        price: 320.0,
        currency: CurrencyCode.ZAR,
        stockQuantity: 25,
        originCountry: CountryCode.SOUTH_AFRICA,
        listingType: ListingType.VENDOR,
        vendor: zuluWeaves,
        vendorId: zuluWeaves.id,
        categories: [textiles],
      },
      {
        name: 'Kalahari Marula Face Serum',
        description:
          "Cold-pressed marula oil face serum enriched with devil's claw extract, 30 ml amber bottle.",
        price: 399.0,
        currency: CurrencyCode.NAD,
        stockQuantity: 40,
        originCountry: CountryCode.NAMIBIA,
        listingType: ListingType.VENDOR,
        vendor: kalahari,
        vendorId: kalahari.id,
        categories: [healthBeauty],
      },
      // --- Platform listings (no vendor) ---
      {
        name: 'HB Leather Tote — Natural Tan',
        description:
          'Full-grain South African leather tote bag, vegetable-tanned, hand-stitched. Sourced and fulfilled by HB.',
        price: 1250.0,
        currency: CurrencyCode.ZAR,
        stockQuantity: 10,
        originCountry: CountryCode.SOUTH_AFRICA,
        listingType: ListingType.PLATFORM,
        categories: [handicrafts],
      },
      {
        name: 'HB Rooibos & Honeybush Gift Set',
        description:
          'Curated set of 3 premium loose-leaf rooibos and honeybush blends, 50 g each. Platform-fulfilled.',
        price: 185.0,
        currency: CurrencyCode.ZAR,
        stockQuantity: 60,
        originCountry: CountryCode.SOUTH_AFRICA,
        listingType: ListingType.PLATFORM,
        categories: [agriculture, healthBeauty],
      },
      {
        name: 'HB Baobab Body Butter',
        description:
          'Rich baobab-seed body butter with shea and mongongo oil, 200 ml jar. Sourced by HB.',
        price: 220.0,
        currency: CurrencyCode.ZAR,
        stockQuantity: 35,
        originCountry: CountryCode.SOUTH_AFRICA,
        listingType: ListingType.PLATFORM,
        categories: [healthBeauty],
      },
    ];

    const savedProducts = await productRepo.save(productDefs.map((def) => productRepo.create(def)));

    console.log(
      `Seed complete — ${savedCategories.length} categories, ${savedVendors.length} vendors, ${savedProducts.length} products created.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
