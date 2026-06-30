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
} from '@hb/shared';

import { AdminCatalog } from './admin-catalog';
import { ProductsService } from '../../../../core/api/products.service';
import { CategoriesService } from '../../../../core/api/categories.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_CATEGORIES: CategoryDto[] = [
  { id: 'cat1', name: 'Electronics', slug: 'electronics', displayOrder: 1 },
  { id: 'cat2', name: 'Clothing', slug: 'clothing', displayOrder: 2, description: 'Apparel and fashion' },
];

const PLATFORM_PRODUCT: ProductDto = {
  id: 'prod1',
  name: 'Platform Widget',
  description: 'A first-party product',
  price: 299.99,
  currency: CurrencyCode.ZAR,
  stockQuantity: 50,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.PLATFORM,
  images: [],
  categories: [{ id: 'cat1', name: 'Electronics' }],
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

const VENDOR_PRODUCT: ProductDto = {
  id: 'prod2',
  name: 'Vendor Gadget',
  description: 'A third-party product',
  price: 149.00,
  currency: CurrencyCode.ZAR,
  stockQuantity: 20,
  originCountry: CountryCode.NAMIBIA,
  listingType: ListingType.VENDOR,
  images: [],
  vendor: { id: 'v1', businessName: 'Acme Corp' },
  categories: [],
  createdAt: '2026-06-02T10:00:00.000Z',
  updatedAt: '2026-06-02T10:00:00.000Z',
};

const MOCK_PRODUCTS: ProductDto[] = [PLATFORM_PRODUCT, VENDOR_PRODUCT];

// ─── Service stub types ───────────────────────────────────────────────────────

interface ProductsServiceStub {
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

interface CategoriesServiceStub {
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupTestBed(
  productsStub: ProductsServiceStub,
  categoriesStub: CategoriesServiceStub
): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [AdminCatalog],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ProductsService, useValue: productsStub },
      { provide: CategoriesService, useValue: categoriesStub },
    ],
  }).compileComponents();
}

// ─── Main component test suite ────────────────────────────────────────────────

describe('AdminCatalog component', () => {
  let component: AdminCatalog;
  let fixture: ComponentFixture<AdminCatalog>;
  let productsStub: ProductsServiceStub;
  let categoriesStub: CategoriesServiceStub;

  beforeEach(async () => {
    productsStub = {
      list: vi.fn(() => of([...MOCK_PRODUCTS])),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    categoriesStub = {
      list: vi.fn(() => of([...MOCK_CATEGORIES])),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    await setupTestBed(productsStub, categoriesStub);

    fixture = TestBed.createComponent(AdminCatalog);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── Requirement 1: Only platform products are shown ────────────────────────

  describe('platform product filtering', () => {
    it('loads both products from service but only shows platform listings', () => {
      expect(productsStub.list).toHaveBeenCalledTimes(1);
      // allProducts contains both
      expect(component.allProducts().length).toBe(2);
      // platformProducts filters to only platform type
      expect(component.platformProducts().length).toBe(1);
      expect(component.platformProducts()[0].id).toBe('prod1');
      expect(component.platformProducts()[0].listingType).toBe(ListingType.PLATFORM);
    });

    it('excludes the vendor product from the platform listing', () => {
      const ids = component.platformProducts().map(p => p.id);
      expect(ids).not.toContain('prod2');
    });

    it('vendor product is in allProducts but not in platformProducts', () => {
      expect(component.allProducts().some(p => p.listingType === ListingType.VENDOR)).toBe(true);
      expect(component.platformProducts().every(p => p.listingType === ListingType.PLATFORM)).toBe(true);
    });
  });

  // ── Requirement 2: Create product — no vendorId ────────────────────────────

  describe('create product', () => {
    it('calls ProductsService.create with a payload that has no vendorId key', async () => {
      const createdProduct: ProductDto = {
        ...PLATFORM_PRODUCT,
        id: 'prod-new',
        name: 'New Widget',
      };
      productsStub.create.mockReturnValue(of(createdProduct));

      component.openCreateProduct();
      component.productForm.setValue({
        name: 'New Widget',
        description: 'A brand new product',
        price: 199.99,
        currency: CurrencyCode.ZAR,
        stockQuantity: 10,
        originCountry: CountryCode.SOUTH_AFRICA,
        categoryIds: ['cat1'],
      });

      component.submitProductForm();
      await fixture.whenStable();

      expect(productsStub.create).toHaveBeenCalledTimes(1);
      const [payload] = productsStub.create.mock.calls[0] as [Record<string, unknown>, File[]];
      // vendorId must NOT be present in the payload at all
      expect('vendorId' in payload).toBe(false);
      expect(payload['name']).toBe('New Widget');
      expect(payload['price']).toBe(199.99);
    });

    it('adds the newly created product to the local signal list', async () => {
      const createdProduct: ProductDto = {
        ...PLATFORM_PRODUCT,
        id: 'prod-new',
        name: 'New Widget',
        listingType: ListingType.PLATFORM,
      };
      productsStub.create.mockReturnValue(of(createdProduct));

      component.openCreateProduct();
      component.productForm.setValue({
        name: 'New Widget',
        description: 'A brand new product',
        price: 199.99,
        currency: CurrencyCode.ZAR,
        stockQuantity: 10,
        originCountry: CountryCode.SOUTH_AFRICA,
        categoryIds: [],
      });

      component.submitProductForm();
      await fixture.whenStable();

      expect(component.allProducts().some(p => p.id === 'prod-new')).toBe(true);
      expect(component.productFormOpen()).toBe(false);
    });

    it('does not send images array in the payload when no images selected', async () => {
      const createdProduct: ProductDto = { ...PLATFORM_PRODUCT, id: 'prod-new' };
      productsStub.create.mockReturnValue(of(createdProduct));

      component.openCreateProduct();
      component.productForm.setValue({
        name: 'No Image Product',
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
      // images arg should be empty array (no files)
      expect(images.length).toBe(0);
    });
  });

  // ── Requirement 3: Edit product ────────────────────────────────────────────

  describe('edit product', () => {
    it('calls ProductsService.update with the correct id and payload', async () => {
      const updatedProduct: ProductDto = {
        ...PLATFORM_PRODUCT,
        name: 'Updated Widget',
        price: 350,
      };
      productsStub.update.mockReturnValue(of(updatedProduct));

      component.openEditProduct(PLATFORM_PRODUCT);
      component.productForm.patchValue({ name: 'Updated Widget', price: 350 });

      component.submitProductForm();
      await fixture.whenStable();

      expect(productsStub.update).toHaveBeenCalledTimes(1);
      const [id, payload] = productsStub.update.mock.calls[0] as [string, Record<string, unknown>];
      expect(id).toBe('prod1');
      expect(payload['name']).toBe('Updated Widget');
      expect(payload['price']).toBe(350);
      // No vendorId in the update payload either
      expect('vendorId' in payload).toBe(false);
    });

    it('updates the product in the local signal list after edit', async () => {
      const updatedProduct: ProductDto = {
        ...PLATFORM_PRODUCT,
        name: 'Updated Widget',
      };
      productsStub.update.mockReturnValue(of(updatedProduct));

      component.openEditProduct(PLATFORM_PRODUCT);
      component.productForm.patchValue({ name: 'Updated Widget' });
      component.submitProductForm();
      await fixture.whenStable();

      const prod = component.allProducts().find(p => p.id === 'prod1');
      expect(prod?.name).toBe('Updated Widget');
    });
  });

  // ── Requirement 4: Delete product ─────────────────────────────────────────

  describe('delete product', () => {
    it('calls ProductsService.delete with the correct id', async () => {
      productsStub.delete.mockReturnValue(of(undefined));

      component.confirmDeleteProduct('prod1');
      expect(component.pendingDeleteProductId()).toBe('prod1');

      component.deleteProduct('prod1');
      await fixture.whenStable();

      expect(productsStub.delete).toHaveBeenCalledWith('prod1');
    });

    it('removes the product from the local list after deletion', async () => {
      productsStub.delete.mockReturnValue(of(undefined));

      component.deleteProduct('prod1');
      await fixture.whenStable();

      expect(component.allProducts().some(p => p.id === 'prod1')).toBe(false);
    });

    it('clears pendingDeleteProductId after successful delete', async () => {
      productsStub.delete.mockReturnValue(of(undefined));

      component.confirmDeleteProduct('prod1');
      component.deleteProduct('prod1');
      await fixture.whenStable();

      expect(component.pendingDeleteProductId()).toBeNull();
    });

    it('cancelDeleteProduct clears the pending delete state', () => {
      component.confirmDeleteProduct('prod1');
      expect(component.pendingDeleteProductId()).toBe('prod1');
      component.cancelDeleteProduct();
      expect(component.pendingDeleteProductId()).toBeNull();
    });
  });

  // ── Requirement 5: Category CRUD ──────────────────────────────────────────

  describe('category create', () => {
    it('calls CategoriesService.create with the correct payload', async () => {
      const newCat: CategoryDto = {
        id: 'cat3',
        name: 'New Category',
        slug: 'new-category',
        displayOrder: 3,
      };
      categoriesStub.create.mockReturnValue(of(newCat));

      component.openCreateCategory();
      component.categoryForm.setValue({
        name: 'New Category',
        slug: 'new-category',
        description: '',
        displayOrder: 3,
        parentId: '',
      });

      component.submitCategoryForm();
      await fixture.whenStable();

      expect(categoriesStub.create).toHaveBeenCalledTimes(1);
      const [payload] = categoriesStub.create.mock.calls[0] as [Record<string, unknown>];
      expect(payload['name']).toBe('New Category');
      expect(payload['slug']).toBe('new-category');
    });

    it('adds the newly created category to the local list', async () => {
      const newCat: CategoryDto = {
        id: 'cat3',
        name: 'New Category',
        displayOrder: 3,
      };
      categoriesStub.create.mockReturnValue(of(newCat));

      component.openCreateCategory();
      component.categoryForm.setValue({
        name: 'New Category',
        slug: '',
        description: '',
        displayOrder: 3,
        parentId: '',
      });

      component.submitCategoryForm();
      await fixture.whenStable();

      expect(component.categories().some(c => c.id === 'cat3')).toBe(true);
      expect(component.categoryFormOpen()).toBe(false);
    });
  });

  describe('category edit', () => {
    it('calls CategoriesService.update with the correct id and payload', async () => {
      const updatedCat: CategoryDto = {
        ...MOCK_CATEGORIES[0],
        name: 'Updated Electronics',
      };
      categoriesStub.update.mockReturnValue(of(updatedCat));

      component.openEditCategory(MOCK_CATEGORIES[0]);
      component.categoryForm.patchValue({ name: 'Updated Electronics' });

      component.submitCategoryForm();
      await fixture.whenStable();

      expect(categoriesStub.update).toHaveBeenCalledTimes(1);
      const [id, payload] = categoriesStub.update.mock.calls[0] as [string, Record<string, unknown>];
      expect(id).toBe('cat1');
      expect(payload['name']).toBe('Updated Electronics');
    });

    it('updates the category in the local list after edit', async () => {
      const updatedCat: CategoryDto = {
        ...MOCK_CATEGORIES[0],
        name: 'Updated Electronics',
      };
      categoriesStub.update.mockReturnValue(of(updatedCat));

      component.openEditCategory(MOCK_CATEGORIES[0]);
      component.categoryForm.patchValue({ name: 'Updated Electronics' });
      component.submitCategoryForm();
      await fixture.whenStable();

      const cat = component.categories().find(c => c.id === 'cat1');
      expect(cat?.name).toBe('Updated Electronics');
    });
  });

  describe('category delete', () => {
    it('calls CategoriesService.delete with the correct id', async () => {
      categoriesStub.delete.mockReturnValue(of(undefined));

      component.confirmDeleteCategory('cat1');
      expect(component.pendingDeleteCategoryId()).toBe('cat1');

      component.deleteCategory('cat1');
      await fixture.whenStable();

      expect(categoriesStub.delete).toHaveBeenCalledWith('cat1');
    });

    it('removes the category from the local list after deletion', async () => {
      categoriesStub.delete.mockReturnValue(of(undefined));

      component.deleteCategory('cat1');
      await fixture.whenStable();

      expect(component.categories().some(c => c.id === 'cat1')).toBe(false);
    });

    it('cancelDeleteCategory clears the pending delete state', () => {
      component.confirmDeleteCategory('cat1');
      expect(component.pendingDeleteCategoryId()).toBe('cat1');
      component.cancelDeleteCategory();
      expect(component.pendingDeleteCategoryId()).toBeNull();
    });

    it('surfaces the server conflict message when delete fails with 409', async () => {
      categoriesStub.delete.mockReturnValue(
        throwError(() => ({
          status: 409,
          error: { message: 'Cannot delete a category that has products; reassign them first' },
        })),
      );

      component.confirmDeleteCategory('cat1');
      component.deleteCategory('cat1');
      await fixture.whenStable();

      expect(component.categoryDeleteError()).toBe(
        'Cannot delete a category that has products; reassign them first',
      );
      // The category must remain in the list — nothing was deleted.
      expect(component.categories().some(c => c.id === 'cat1')).toBe(true);
      expect(component.pendingDeleteCategoryId()).toBeNull();
    });

    it('clears a prior delete error when a new delete is confirmed', () => {
      component.categoryDeleteError.set('stale error');
      component.confirmDeleteCategory('cat2');
      expect(component.categoryDeleteError()).toBeNull();
    });
  });

  // ── General state ──────────────────────────────────────────────────────────

  describe('loading and error states', () => {
    it('clears loading flags after successful data load', () => {
      expect(component.productsLoading()).toBe(false);
      expect(component.categoriesLoading()).toBe(false);
    });

    it('defaults to products view', () => {
      expect(component.activeView()).toBe('products');
    });

    it('switchView changes the active view', () => {
      component.switchView('categories');
      expect(component.activeView()).toBe('categories');
    });
  });
});

// ─── Error path: products load failure ───────────────────────────────────────

describe('AdminCatalog — products load error', () => {
  it('sets productsError and clears productsLoading when list() fails', async () => {
    const productsStub: ProductsServiceStub = {
      list: vi.fn(() => throwError(() => new Error('500'))),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const categoriesStub: CategoriesServiceStub = {
      list: vi.fn(() => of([])),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminCatalog],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProductsService, useValue: productsStub },
        { provide: CategoriesService, useValue: categoriesStub },
      ],
    }).compileComponents();

    const failFixture = TestBed.createComponent(AdminCatalog);
    const failComponent = failFixture.componentInstance;
    failFixture.detectChanges();
    await failFixture.whenStable();

    expect(failComponent.productsLoading()).toBe(false);
    expect(failComponent.productsError()).toBeTruthy();
  });
});

// ─── Error path: categories load failure ─────────────────────────────────────

describe('AdminCatalog — categories load error', () => {
  it('sets categoriesError and clears categoriesLoading when list() fails', async () => {
    const productsStub: ProductsServiceStub = {
      list: vi.fn(() => of([])),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const categoriesStub: CategoriesServiceStub = {
      list: vi.fn(() => throwError(() => new Error('500'))),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminCatalog],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProductsService, useValue: productsStub },
        { provide: CategoriesService, useValue: categoriesStub },
      ],
    }).compileComponents();

    const failFixture = TestBed.createComponent(AdminCatalog);
    const failComponent = failFixture.componentInstance;
    failFixture.detectChanges();
    await failFixture.whenStable();

    expect(failComponent.categoriesLoading()).toBe(false);
    expect(failComponent.categoriesError()).toBeTruthy();
  });
});
