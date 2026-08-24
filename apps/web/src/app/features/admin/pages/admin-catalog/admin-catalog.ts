import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { map as rxMap } from 'rxjs/operators';
import {
  CategoryDto,
  CountryCode,
  CurrencyCode,
  ListingType,
  ProductDto,
  ProductShippingFeeOverrideDto,
  ProductShippingFeeOverrideRoute,
  ShippingFeeDto,
} from '@hb/shared';
import { ProductsService } from '../../../../core/api/products.service';
import { CategoriesService } from '../../../../core/api/categories.service';
import { ShippingFeeService } from '../../../../core/api/shipping-fee.service';
import { ProductShippingFeeOverrideService } from '../../../../core/api/product-shipping-fee-override.service';

type CatalogView = 'products' | 'categories' | 'vendor-products';

/** Server-side max page size — used to avoid truncating the admin catalog list. */
const PRODUCT_LIST_MAX = 100;

/** Amount format enforced client-side too — money is never float-arithmetic'd, only pattern-checked. */
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** The 4 routes x 2 currencies = 8 (route, currency) combinations a per-product override can target. */
const SHIPPING_FEE_CELLS: ProductShippingFeeOverrideRoute[] = (
  [
    [CountryCode.SOUTH_AFRICA, CountryCode.SOUTH_AFRICA],
    [CountryCode.SOUTH_AFRICA, CountryCode.NAMIBIA],
    [CountryCode.NAMIBIA, CountryCode.NAMIBIA],
    [CountryCode.NAMIBIA, CountryCode.SOUTH_AFRICA],
  ] as const
).flatMap(([originCountry, destinationCountry]) =>
  ([CurrencyCode.ZAR, CurrencyCode.NAD] as const).map(currency => ({
    originCountry,
    destinationCountry,
    currency,
  }))
);

@Component({
  selector: 'app-admin-catalog',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './admin-catalog.html',
  styleUrl: './admin-catalog.scss',
})
export class AdminCatalog implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly shippingFeeService = inject(ShippingFeeService);
  private readonly overrideService = inject(ProductShippingFeeOverrideService);
  private readonly fb = inject(FormBuilder);

  // ─── Section tabs ───────────────────────────────────────────────────────────
  readonly activeView = signal<CatalogView>('products');

  // ─── Products state ──────────────────────────────────────────────────────────
  readonly allProducts = signal<ProductDto[]>([]);
  readonly productsLoading = signal(true);
  readonly productsError = signal<string | null>(null);

  /** Only platform listings — vendor listings are never shown here. */
  readonly platformProducts = computed(() =>
    this.allProducts().filter(p => p.listingType === ListingType.PLATFORM)
  );

  // ─── Vendor Products (SF-6) ───────────────────────────────────────────────
  /**
   * Vendor-listed products, sourced from the same `allProducts` load already
   * used by the Products tab (client-side `computed()` filter, matching the
   * existing `platformProducts` pattern) — zero extra list requests.
   * Relies on the admin catalog's PRODUCT_LIST_MAX=100 cap, same as
   * platformProducts; if the vendor catalog outgrows one page, add
   * `listingType` to ProductQuery and filter server-side instead.
   */
  readonly vendorProducts = computed(() =>
    this.allProducts().filter(p => p.listingType === ListingType.VENDOR)
  );

  readonly shippingCells = SHIPPING_FEE_CELLS;

  readonly vendorShippingLoading = signal(false);
  readonly vendorShippingError = signal<string | null>(null);
  private vendorShippingLoaded = false;

  /** The in-force global default set (SF-1), 8 (route, currency) rows once configured. */
  readonly defaultShippingFees = signal<ShippingFeeDto[]>([]);
  /** Per-product sparse override list, sourced lazily via GET per product row (see report). */
  readonly overridesByProduct = signal<Map<string, ProductShippingFeeOverrideDto[]>>(new Map());

  readonly expandedVendorProductId = signal<string | null>(null);
  /** Cell key of the in-flight set/clear, if any — guards double-submit across the whole panel. */
  readonly cellPending = signal<string | null>(null);
  readonly cellError = signal<string | null>(null);

  /** Rebuilt each time a row's shipping panel is opened. */
  shippingForm: FormGroup = this.fb.group({});

  // ─── Categories state ────────────────────────────────────────────────────────
  readonly categories = signal<CategoryDto[]>([]);
  readonly categoriesLoading = signal(true);
  readonly categoriesError = signal<string | null>(null);

  // ─── Product form state ──────────────────────────────────────────────────────
  readonly productFormOpen = signal(false);
  readonly productFormMode = signal<'create' | 'edit'>('create');
  readonly productFormPending = signal(false);
  readonly productFormError = signal<string | null>(null);
  readonly editingProductId = signal<string | null>(null);

  readonly productForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    description: ['', Validators.required],
    price: [null as number | null, [Validators.required, Validators.min(0)]],
    currency: [CurrencyCode.ZAR, Validators.required],
    stockQuantity: [0, [Validators.required, Validators.min(0)]],
    originCountry: [CountryCode.SOUTH_AFRICA, Validators.required],
    categoryIds: [[] as string[]],
  });

  /** Selected image files for create — only used during create, not edit. */
  readonly selectedImages = signal<File[]>([]);

  // ─── Category form state ─────────────────────────────────────────────────────
  readonly categoryFormOpen = signal(false);
  readonly categoryFormMode = signal<'create' | 'edit'>('create');
  readonly categoryFormPending = signal(false);
  readonly categoryFormError = signal<string | null>(null);
  readonly editingCategoryId = signal<string | null>(null);

  readonly categoryForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    slug: [''],
    description: [''],
    displayOrder: [0],
    parentId: [''],
  });

  // ─── Delete guard ────────────────────────────────────────────────────────────
  readonly pendingDeleteProductId = signal<string | null>(null);
  readonly pendingDeleteCategoryId = signal<string | null>(null);
  /** Surfaces a category-delete conflict (e.g. 409 — category in use or has children). */
  readonly categoryDeleteError = signal<string | null>(null);

  // ─── Expose enums to template ─────────────────────────────────────────────
  readonly CurrencyCode = CurrencyCode;
  readonly CountryCode = CountryCode;

  ngOnInit(): void {
    this.loadProducts();
    this.loadCategories();
  }

  // ─── Section switching ────────────────────────────────────────────────────
  switchView(view: CatalogView): void {
    this.activeView.set(view);
    if (view === 'vendor-products') {
      this.loadVendorShippingData();
    }
  }

  // ─── Vendor Products / shipping-fee overrides (SF-6) ───────────────────────

  /** Loads the global default set + each vendor product's overrides once, on first visit to the tab. */
  private loadVendorShippingData(): void {
    if (this.vendorShippingLoaded) return;
    this.vendorShippingLoaded = true;
    this.vendorShippingLoading.set(true);
    this.vendorShippingError.set(null);

    this.shippingFeeService.list().subscribe({
      next: (history) => {
        const inForce = history.items.find(s => s.inForce);
        this.defaultShippingFees.set(inForce?.fees ?? []);
      },
      error: () => {
        this.vendorShippingError.set('Failed to load default shipping fees.');
      },
    });

    const productIds = this.vendorProducts().map(p => p.id);
    if (productIds.length === 0) {
      this.vendorShippingLoading.set(false);
      return;
    }

    forkJoin(
      productIds.map(id =>
        this.overrideService.list(id).pipe(
          rxMap(overrides => [id, overrides] as const),
          catchError(() => of([id, [] as ProductShippingFeeOverrideDto[]] as const)),
        )
      )
    ).subscribe({
      next: (pairs) => {
        const overridesMap = new Map<string, ProductShippingFeeOverrideDto[]>();
        for (const [id, overrides] of pairs) overridesMap.set(id, overrides);
        this.overridesByProduct.set(overridesMap);
        this.vendorShippingLoading.set(false);
      },
      error: () => {
        this.vendorShippingError.set('Failed to load shipping fee overrides.');
        this.vendorShippingLoading.set(false);
      },
    });
  }

  cellKey(route: ProductShippingFeeOverrideRoute): string {
    return `${route.originCountry}_${route.destinationCountry}_${route.currency}`;
  }

  routeLabel(route: ProductShippingFeeOverrideRoute): string {
    return `${route.originCountry} → ${route.destinationCountry}`;
  }

  /** The override for this exact (product, route, currency), if one exists — never matched by route or currency alone. */
  private findOverride(
    productId: string,
    route: ProductShippingFeeOverrideRoute
  ): ProductShippingFeeOverrideDto | undefined {
    return this.overridesByProduct().get(productId)?.find(
      o =>
        o.originCountry === route.originCountry &&
        o.destinationCountry === route.destinationCountry &&
        o.currency === route.currency
    );
  }

  private findDefault(route: ProductShippingFeeOverrideRoute): ShippingFeeDto | undefined {
    return this.defaultShippingFees().find(
      f =>
        f.originCountry === route.originCountry &&
        f.destinationCountry === route.destinationCountry &&
        f.currency === route.currency
    );
  }

  cellHasOverride(productId: string, route: ProductShippingFeeOverrideRoute): boolean {
    return !!this.findOverride(productId, route);
  }

  /** Effective-fee label for this exact cell — visually distinct override vs. default, per the acceptance criteria. */
  feeLabel(productId: string, route: ProductShippingFeeOverrideRoute): string {
    const override = this.findOverride(productId, route);
    if (override) {
      return `Override (${override.currency} ${override.amount.toFixed(2)})`;
    }
    const def = this.findDefault(route);
    if (def) {
      return `Default (${def.currency} ${def.amount.toFixed(2)})`;
    }
    return 'Not configured';
  }

  toggleShippingPanel(productId: string): void {
    if (this.expandedVendorProductId() === productId) {
      this.expandedVendorProductId.set(null);
      return;
    }
    this.expandedVendorProductId.set(productId);
    this.cellError.set(null);
    this.shippingForm = this.buildShippingForm(productId);
  }

  private buildShippingForm(productId: string): FormGroup {
    const group: Record<string, unknown[]> = {};
    for (const cell of this.shippingCells) {
      const existing = this.findOverride(productId, cell);
      group[this.cellKey(cell)] = [
        existing ? existing.amount.toFixed(2) : '',
        [Validators.pattern(AMOUNT_PATTERN)],
      ];
    }
    return this.fb.group(group);
  }

  private upsertOverride(productId: string, dto: ProductShippingFeeOverrideDto): void {
    this.overridesByProduct.update(current => {
      const next = new Map(current);
      const existing = next.get(productId) ?? [];
      const filtered = existing.filter(
        o =>
          !(
            o.originCountry === dto.originCountry &&
            o.destinationCountry === dto.destinationCountry &&
            o.currency === dto.currency
          )
      );
      next.set(productId, [...filtered, dto]);
      return next;
    });
  }

  setCellOverride(productId: string, route: ProductShippingFeeOverrideRoute): void {
    const key = this.cellKey(route);
    if (this.cellPending()) return;

    const control = this.shippingForm.get(key);
    const raw = String(control?.value ?? '').trim();
    if (!AMOUNT_PATTERN.test(raw)) {
      control?.markAsTouched();
      return;
    }

    this.cellPending.set(key);
    this.cellError.set(null);
    this.overrideService
      .set(productId, {
        originCountry: route.originCountry,
        destinationCountry: route.destinationCountry,
        currency: route.currency,
        amount: Number(raw),
      })
      .subscribe({
        next: (dto) => {
          // Optimistic-safe: the row updates from the server response, not a client-side guess.
          this.upsertOverride(productId, dto);
          this.shippingForm.get(key)?.setValue(dto.amount.toFixed(2));
          this.cellPending.set(null);
        },
        error: (err: HttpErrorResponse) => {
          this.cellError.set(err.error?.message ?? 'Failed to set shipping fee override. Please try again.');
          this.cellPending.set(null);
        },
      });
  }

  clearCellOverride(productId: string, route: ProductShippingFeeOverrideRoute): void {
    const key = this.cellKey(route);
    if (this.cellPending()) return;

    this.cellPending.set(key);
    this.cellError.set(null);
    this.overrideService.clear(productId, route).subscribe({
      next: () => {
        // Re-read rather than assume: the cell must fall back to whatever the global default
        // actually resolves to, sourced from the server — never assumed to be zero.
        this.overrideService.list(productId).subscribe({
          next: (overrides) => {
            this.overridesByProduct.update(current => {
              const next = new Map(current);
              next.set(productId, overrides);
              return next;
            });
            this.shippingForm.get(key)?.setValue('');
            this.cellPending.set(null);
          },
          error: () => {
            this.cellError.set('Cleared, but failed to refresh the fee — please reopen this row.');
            this.cellPending.set(null);
          },
        });
      },
      error: (err: HttpErrorResponse) => {
        this.cellError.set(err.error?.message ?? 'Failed to clear shipping fee override. Please try again.');
        this.cellPending.set(null);
      },
    });
  }

  // ─── Products CRUD ─────────────────────────────────────────────────────────

  private loadProducts(): void {
    this.productsLoading.set(true);
    this.productsError.set(null);
    this.productsService.list({ limit: PRODUCT_LIST_MAX }).subscribe({
      next: (res) => {
        this.allProducts.set(res.items);
        this.productsLoading.set(false);
      },
      error: () => {
        this.productsError.set('Failed to load products. Please refresh the page.');
        this.productsLoading.set(false);
      },
    });
  }

  openCreateProduct(): void {
    this.productFormMode.set('create');
    this.editingProductId.set(null);
    this.productForm.reset({
      name: '',
      description: '',
      price: null,
      currency: CurrencyCode.ZAR,
      stockQuantity: 0,
      originCountry: CountryCode.SOUTH_AFRICA,
      categoryIds: [],
    });
    this.selectedImages.set([]);
    this.productFormError.set(null);
    this.productFormOpen.set(true);
  }

  openEditProduct(product: ProductDto): void {
    this.productFormMode.set('edit');
    this.editingProductId.set(product.id);
    this.productForm.reset({
      name: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      stockQuantity: product.stockQuantity,
      originCountry: product.originCountry,
      categoryIds: product.categories.map(c => c.id),
    });
    this.productFormError.set(null);
    this.productFormOpen.set(true);
  }

  closeProductForm(): void {
    this.productFormOpen.set(false);
  }

  onImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    this.selectedImages.set(files);
  }

  isCategorySelected(id: string): boolean {
    return (this.productForm.get('categoryIds')?.value as string[] ?? []).includes(id);
  }

  toggleCategory(id: string): void {
    const current: string[] = this.productForm.get('categoryIds')?.value ?? [];
    const updated = current.includes(id)
      ? current.filter(c => c !== id)
      : [...current, id];
    this.productForm.get('categoryIds')?.setValue(updated);
  }

  submitProductForm(): void {
    if (this.productForm.invalid || this.productFormPending()) return;
    this.productFormPending.set(true);
    this.productFormError.set(null);

    const raw = this.productForm.getRawValue();

    if (this.productFormMode() === 'create') {
      // Build payload — vendorId is deliberately omitted; server enforces platform listing.
      const payload = {
        name: raw.name as string,
        description: raw.description as string,
        price: raw.price as number,
        currency: raw.currency as CurrencyCode,
        stockQuantity: raw.stockQuantity as number,
        originCountry: raw.originCountry as CountryCode,
        categoryIds: (raw.categoryIds as string[]).length ? raw.categoryIds as string[] : undefined,
      };
      const images = this.selectedImages();
      this.productsService.create(payload, images).subscribe({
        next: (created) => {
          this.allProducts.update(list => [created, ...list]);
          this.productFormPending.set(false);
          this.productFormOpen.set(false);
        },
        error: () => {
          this.productFormError.set('Failed to create product. Please try again.');
          this.productFormPending.set(false);
        },
      });
    } else {
      const id = this.editingProductId();
      if (!id) return;
      // PATCH payload — no vendorId, no images
      const payload = {
        name: raw.name as string,
        description: raw.description as string,
        price: raw.price as number,
        currency: raw.currency as CurrencyCode,
        stockQuantity: raw.stockQuantity as number,
        originCountry: raw.originCountry as CountryCode,
        categoryIds: raw.categoryIds as string[],
      };
      this.productsService.update(id, payload).subscribe({
        next: (updated) => {
          this.allProducts.update(list =>
            list.map(p => p.id === id ? updated : p)
          );
          this.productFormPending.set(false);
          this.productFormOpen.set(false);
        },
        error: () => {
          this.productFormError.set('Failed to update product. Please try again.');
          this.productFormPending.set(false);
        },
      });
    }
  }

  confirmDeleteProduct(id: string): void {
    this.pendingDeleteProductId.set(id);
  }

  cancelDeleteProduct(): void {
    this.pendingDeleteProductId.set(null);
  }

  deleteProduct(id: string): void {
    this.productsService.delete(id).subscribe({
      next: () => {
        this.allProducts.update(list => list.filter(p => p.id !== id));
        this.pendingDeleteProductId.set(null);
      },
      error: () => {
        this.pendingDeleteProductId.set(null);
      },
    });
  }

  primaryImageUrl(product: ProductDto): string | null {
    const primary = product.images.find(img => img.isPrimary) ?? product.images[0];
    return primary?.url ?? null;
  }

  // ─── Categories CRUD ───────────────────────────────────────────────────────

  private loadCategories(): void {
    this.categoriesLoading.set(true);
    this.categoriesError.set(null);
    this.categoriesService.list().subscribe({
      next: (cats) => {
        this.categories.set(cats);
        this.categoriesLoading.set(false);
      },
      error: () => {
        this.categoriesError.set('Failed to load categories. Please refresh the page.');
        this.categoriesLoading.set(false);
      },
    });
  }

  openCreateCategory(): void {
    this.categoryFormMode.set('create');
    this.editingCategoryId.set(null);
    this.categoryForm.reset({ name: '', slug: '', description: '', displayOrder: 0, parentId: '' });
    this.categoryFormError.set(null);
    this.categoryFormOpen.set(true);
  }

  openEditCategory(cat: CategoryDto): void {
    this.categoryFormMode.set('edit');
    this.editingCategoryId.set(cat.id);
    this.categoryForm.reset({
      name: cat.name,
      slug: cat.slug ?? '',
      description: cat.description ?? '',
      displayOrder: cat.displayOrder,
      parentId: cat.parentId ?? '',
    });
    this.categoryFormError.set(null);
    this.categoryFormOpen.set(true);
  }

  closeCategoryForm(): void {
    this.categoryFormOpen.set(false);
  }

  submitCategoryForm(): void {
    if (this.categoryForm.invalid || this.categoryFormPending()) return;
    this.categoryFormPending.set(true);
    this.categoryFormError.set(null);

    const raw = this.categoryForm.getRawValue();

    const payload = {
      name: raw.name as string,
      ...(raw.slug ? { slug: raw.slug as string } : {}),
      ...(raw.description ? { description: raw.description as string } : {}),
      ...(raw.displayOrder !== null && raw.displayOrder !== undefined
        ? { displayOrder: raw.displayOrder as number }
        : {}),
      ...(raw.parentId ? { parentId: raw.parentId as string } : {}),
    };

    if (this.categoryFormMode() === 'create') {
      this.categoriesService.create(payload).subscribe({
        next: (created) => {
          this.categories.update(list => [...list, created]);
          this.categoryFormPending.set(false);
          this.categoryFormOpen.set(false);
        },
        error: () => {
          this.categoryFormError.set('Failed to create category. Please try again.');
          this.categoryFormPending.set(false);
        },
      });
    } else {
      const id = this.editingCategoryId();
      if (!id) return;
      this.categoriesService.update(id, payload).subscribe({
        next: (updated) => {
          this.categories.update(list =>
            list.map(c => c.id === id ? updated : c)
          );
          this.categoryFormPending.set(false);
          this.categoryFormOpen.set(false);
        },
        error: () => {
          this.categoryFormError.set('Failed to update category. Please try again.');
          this.categoryFormPending.set(false);
        },
      });
    }
  }

  confirmDeleteCategory(id: string): void {
    this.categoryDeleteError.set(null);
    this.pendingDeleteCategoryId.set(id);
  }

  cancelDeleteCategory(): void {
    this.pendingDeleteCategoryId.set(null);
  }

  deleteCategory(id: string): void {
    this.categoryDeleteError.set(null);
    this.categoriesService.delete(id).subscribe({
      next: () => {
        this.categories.update(list => list.filter(c => c.id !== id));
        this.pendingDeleteCategoryId.set(null);
      },
      error: (err: HttpErrorResponse) => {
        // Surface the server's conflict message (409 — category in use / has children).
        this.categoryDeleteError.set(
          err.error?.message ?? 'Failed to delete category. Please try again.',
        );
        this.pendingDeleteCategoryId.set(null);
      },
    });
  }
}
