import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CategoryDto,
  CountryCode,
  CurrencyCode,
  ListingType,
  ProductDto,
  VendorDto,
  VendorStatus,
} from '@hb/shared';

import { VendorProducts } from './vendor-products';
import { ProductsService } from '../../../../core/api/products.service';
import { VendorsService } from '../../../../core/api/vendors.service';
import { CategoriesService } from '../../../../core/api/categories.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_VENDOR: VendorDto = {
  id: 'vendor-1',
  businessName: 'My Store',
  status: VendorStatus.APPROVED,
  countryCode: CountryCode.SOUTH_AFRICA,
};

const MY_PRODUCT: ProductDto = {
  id: 'prod-1',
  name: 'My Widget',
  description: 'A product I sell',
  price: 199.99,
  currency: CurrencyCode.ZAR,
  stockQuantity: 10,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.VENDOR,
  images: [],
  vendor: { id: 'vendor-1', businessName: 'My Store' },
  categories: [],
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

const OTHER_VENDOR_PRODUCT: ProductDto = {
  id: 'prod-2',
  name: 'Other Vendor Widget',
  description: 'Belongs to a different vendor',
  price: 99.00,
  currency: CurrencyCode.ZAR,
  stockQuantity: 5,
  originCountry: CountryCode.NAMIBIA,
  listingType: ListingType.VENDOR,
  images: [],
  vendor: { id: 'vendor-99', businessName: 'Other Store' },
  categories: [],
  createdAt: '2026-06-02T10:00:00.000Z',
  updatedAt: '2026-06-02T10:00:00.000Z',
};

const PLATFORM_PRODUCT: ProductDto = {
  id: 'prod-3',
  name: 'Platform Listing',
  description: 'First-party listing',
  price: 49.00,
  currency: CurrencyCode.ZAR,
  stockQuantity: 100,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.PLATFORM,
  images: [],
  categories: [],
  createdAt: '2026-06-03T10:00:00.000Z',
  updatedAt: '2026-06-03T10:00:00.000Z',
};

const MOCK_CATEGORIES: CategoryDto[] = [
  { id: 'cat-1', name: 'Electronics', slug: 'electronics', displayOrder: 1 },
];

// ─── Stub interfaces ──────────────────────────────────────────────────────────

interface ProductsStub {
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

interface VendorsStub {
  getMe: ReturnType<typeof vi.fn>;
}

interface CategoriesStub {
  list: ReturnType<typeof vi.fn>;
}

// ─── Setup helper ─────────────────────────────────────────────────────────────

function makeStubs(): { productsStub: ProductsStub; vendorsStub: VendorsStub; categoriesStub: CategoriesStub } {
  return {
    productsStub: {
      list: vi.fn(() =>
        of({
          items: [MY_PRODUCT, OTHER_VENDOR_PRODUCT, PLATFORM_PRODUCT],
          total: 3,
          page: 1,
          limit: 100,
        }),
      ),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    vendorsStub: {
      getMe: vi.fn(() => of(MOCK_VENDOR)),
    },
    categoriesStub: {
      list: vi.fn(() => of(MOCK_CATEGORIES)),
    },
  };
}

async function setupTestBed(
  productsStub: ProductsStub,
  vendorsStub: VendorsStub,
  categoriesStub: CategoriesStub,
): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [VendorProducts],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ProductsService, useValue: productsStub },
      { provide: VendorsService, useValue: vendorsStub },
      { provide: CategoriesService, useValue: categoriesStub },
    ],
  }).compileComponents();
}

// ─── Main suite ───────────────────────────────────────────────────────────────

describe('VendorProducts component', () => {
  let component: VendorProducts;
  let fixture: ComponentFixture<VendorProducts>;
  let productsStub: ProductsStub;
  let vendorsStub: VendorsStub;
  let categoriesStub: CategoriesStub;

  beforeEach(async () => {
    ({ productsStub, vendorsStub, categoriesStub } = makeStubs());
    await setupTestBed(productsStub, vendorsStub, categoriesStub);
    fixture = TestBed.createComponent(VendorProducts);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── Requirement 1: Only own vendor products are shown ──────────────────────

  describe('vendor-only filtering', () => {
    it('loads all products from the service but only shows the vendor own listings', () => {
      expect(productsStub.list).toHaveBeenCalledTimes(1);
      expect(productsStub.list).toHaveBeenCalledWith({ limit: 100 });
      // allProducts has all three
      expect(component.allProducts().length).toBe(3);
      // vendorProducts keeps only this vendor's listings
      expect(component.vendorProducts().length).toBe(1);
      expect(component.vendorProducts()[0].id).toBe('prod-1');
    });

    it('excludes other vendors products from the vendor view', () => {
      const ids = component.vendorProducts().map(p => p.id);
      expect(ids).not.toContain('prod-2');
    });

    it('excludes platform listings from the vendor view', () => {
      const ids = component.vendorProducts().map(p => p.id);
      expect(ids).not.toContain('prod-3');
    });

    it('sets vendorId from GET /vendors/me', () => {
      expect(component.vendorId()).toBe('vendor-1');
    });

    it('returns empty list when vendorId is not yet resolved', () => {
      component.vendorId.set(null);
      expect(component.vendorProducts()).toEqual([]);
    });
  });

  // ── Requirement 2: Create product — server sets vendorId ──────────────────

  describe('create product', () => {
    it('calls ProductsService.create without a vendorId in the payload', async () => {
      const created: ProductDto = { ...MY_PRODUCT, id: 'prod-new', name: 'New Item' };
      productsStub.create.mockReturnValue(of(created));

      component.openCreateProduct();
      component.productForm.setValue({
        name: 'New Item',
        description: 'A new product',
        price: 299,
        currency: CurrencyCode.ZAR,
        stockQuantity: 5,
        originCountry: CountryCode.SOUTH_AFRICA,
        categoryIds: [],
      });

      component.submitProductForm();
      await fixture.whenStable();

      expect(productsStub.create).toHaveBeenCalledTimes(1);
      const [payload] = productsStub.create.mock.calls[0] as [Record<string, unknown>, File[]];
      // vendorId must NOT appear — the server derives it from the auth token
      expect('vendorId' in payload).toBe(false);
      expect(payload['name']).toBe('New Item');
      expect(payload['price']).toBe(299);
    });

    it('adds the created product to allProducts and closes the form', async () => {
      const created: ProductDto = { ...MY_PRODUCT, id: 'prod-new' };
      productsStub.create.mockReturnValue(of(created));

      component.openCreateProduct();
      component.productForm.setValue({
        name: 'New Item',
        description: 'desc',
        price: 10,
        currency: CurrencyCode.ZAR,
        stockQuantity: 0,
        originCountry: CountryCode.SOUTH_AFRICA,
        categoryIds: [],
      });

      component.submitProductForm();
      await fixture.whenStable();

      expect(component.allProducts().some(p => p.id === 'prod-new')).toBe(true);
      expect(component.productFormOpen()).toBe(false);
    });

    it('passes an empty images array when no files selected', async () => {
      const created: ProductDto = { ...MY_PRODUCT, id: 'prod-new' };
      productsStub.create.mockReturnValue(of(created));

      component.openCreateProduct();
      component.productForm.setValue({
        name: 'Item',
        description: 'desc',
        price: 10,
        currency: CurrencyCode.ZAR,
        stockQuantity: 0,
        originCountry: CountryCode.SOUTH_AFRICA,
        categoryIds: [],
      });

      component.submitProductForm();
      await fixture.whenStable();

      const [, images] = productsStub.create.mock.calls[0] as [unknown, File[]];
      expect(images.length).toBe(0);
    });

    it('shows an error message when create fails', async () => {
      productsStub.create.mockReturnValue(throwError(() => new Error('500')));

      component.openCreateProduct();
      component.productForm.setValue({
        name: 'Item',
        description: 'desc',
        price: 10,
        currency: CurrencyCode.ZAR,
        stockQuantity: 0,
        originCountry: CountryCode.SOUTH_AFRICA,
        categoryIds: [],
      });

      component.submitProductForm();
      await fixture.whenStable();

      expect(component.productFormError()).toBeTruthy();
      expect(component.productFormPending()).toBe(false);
    });
  });

  // ── Requirement 3: Edit product ────────────────────────────────────────────

  describe('edit product', () => {
    it('calls ProductsService.update with the correct id and updated payload', async () => {
      const updated: ProductDto = { ...MY_PRODUCT, name: 'Updated Widget', price: 350 };
      productsStub.update.mockReturnValue(of(updated));

      component.openEditProduct(MY_PRODUCT);
      component.productForm.patchValue({ name: 'Updated Widget', price: 350 });

      component.submitProductForm();
      await fixture.whenStable();

      expect(productsStub.update).toHaveBeenCalledTimes(1);
      const [id, payload] = productsStub.update.mock.calls[0] as [string, Record<string, unknown>];
      expect(id).toBe('prod-1');
      expect(payload['name']).toBe('Updated Widget');
      expect(payload['price']).toBe(350);
      expect('vendorId' in payload).toBe(false);
    });

    it('updates the product in the local list and closes the form', async () => {
      const updated: ProductDto = { ...MY_PRODUCT, name: 'Updated Widget' };
      productsStub.update.mockReturnValue(of(updated));

      component.openEditProduct(MY_PRODUCT);
      component.productForm.patchValue({ name: 'Updated Widget' });
      component.submitProductForm();
      await fixture.whenStable();

      const prod = component.allProducts().find(p => p.id === 'prod-1');
      expect(prod?.name).toBe('Updated Widget');
      expect(component.productFormOpen()).toBe(false);
    });
  });

  // ── Requirement 4: Delete product ─────────────────────────────────────────

  describe('delete product', () => {
    it('calls ProductsService.delete with the correct id', async () => {
      productsStub.delete.mockReturnValue(of(undefined));

      component.confirmDeleteProduct('prod-1');
      expect(component.pendingDeleteProductId()).toBe('prod-1');

      component.deleteProduct('prod-1');
      await fixture.whenStable();

      expect(productsStub.delete).toHaveBeenCalledWith('prod-1');
    });

    it('removes the product from allProducts after deletion', async () => {
      productsStub.delete.mockReturnValue(of(undefined));

      component.deleteProduct('prod-1');
      await fixture.whenStable();

      expect(component.allProducts().some(p => p.id === 'prod-1')).toBe(false);
    });

    it('clears pendingDeleteProductId after deletion', async () => {
      productsStub.delete.mockReturnValue(of(undefined));

      component.confirmDeleteProduct('prod-1');
      component.deleteProduct('prod-1');
      await fixture.whenStable();

      expect(component.pendingDeleteProductId()).toBeNull();
    });

    it('cancelDeleteProduct clears the pending state', () => {
      component.confirmDeleteProduct('prod-1');
      component.cancelDeleteProduct();
      expect(component.pendingDeleteProductId()).toBeNull();
    });

    it('sets deleteError and clears pending when delete fails', async () => {
      productsStub.delete.mockReturnValue(throwError(() => new Error('500')));

      component.confirmDeleteProduct('prod-1');
      component.deleteProduct('prod-1');
      await fixture.whenStable();

      expect(component.deleteError()).toBeTruthy();
      expect(component.pendingDeleteProductId()).toBeNull();
      // Product should still be in the list
      expect(component.allProducts().some(p => p.id === 'prod-1')).toBe(true);
    });

    it('clears deleteError when starting a new delete', async () => {
      productsStub.delete.mockReturnValue(of(undefined));

      component.deleteError.set('Some previous error');
      component.deleteProduct('prod-1');
      await fixture.whenStable();

      expect(component.deleteError()).toBeNull();
    });
  });

  // ── Requirement 5: Loading + error states ─────────────────────────────────

  describe('loading and error states', () => {
    it('clears loading flags after data loads successfully', () => {
      expect(component.productsLoading()).toBe(false);
      expect(component.vendorLoading()).toBe(false);
      expect(component.categoriesLoading()).toBe(false);
    });

    it('loads categories for the form', () => {
      expect(categoriesStub.list).toHaveBeenCalledTimes(1);
      expect(component.categories().length).toBe(1);
    });
  });
});

// ─── Error path: products load failure ───────────────────────────────────────

describe('VendorProducts — products load error', () => {
  it('sets productsError and clears productsLoading when list() fails', async () => {
    const { vendorsStub, categoriesStub } = makeStubs();
    const failProductsStub: ProductsStub = {
      list: vi.fn(() => throwError(() => new Error('500'))),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    await setupTestBed(failProductsStub, vendorsStub, categoriesStub);

    const failFixture = TestBed.createComponent(VendorProducts);
    const failComponent = failFixture.componentInstance;
    failFixture.detectChanges();
    await failFixture.whenStable();

    expect(failComponent.productsLoading()).toBe(false);
    expect(failComponent.productsError()).toBeTruthy();
  });
});

// ─── Error path: vendor profile load failure ──────────────────────────────────

describe('VendorProducts — vendor profile load error', () => {
  it('sets vendorError and clears vendorLoading when getMe() fails', async () => {
    const { productsStub, categoriesStub } = makeStubs();
    const failVendorsStub: VendorsStub = {
      getMe: vi.fn(() => throwError(() => new Error('404'))),
    };

    await setupTestBed(productsStub, failVendorsStub, categoriesStub);

    const failFixture = TestBed.createComponent(VendorProducts);
    const failComponent = failFixture.componentInstance;
    failFixture.detectChanges();
    await failFixture.whenStable();

    expect(failComponent.vendorLoading()).toBe(false);
    expect(failComponent.vendorError()).toBeTruthy();
    expect(failComponent.vendorId()).toBeNull();
  });
});
