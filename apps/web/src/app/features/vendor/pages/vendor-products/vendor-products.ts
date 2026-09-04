import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  ValidatorFn,
  FormGroup,
  FormArray,
} from '@angular/forms';
import {
  CategoryDto,
  CountryCode,
  CurrencyCode,
  ProductDto,
  ProductSizeInput,
} from '@hb/shared';
import { ProductsService } from '../../../../core/api/products.service';
import { VendorsService } from '../../../../core/api/vendors.service';
import { CategoriesService } from '../../../../core/api/categories.service';

/** Server-side max page size — used to avoid truncating the vendor's own product list. */
const PRODUCT_LIST_MAX = 100;

/**
 * FormArray-level validator for the `sizes` rows — mirrors the server's
 * `assertUniqueSizeLabels` (products.service.ts): trims each label before
 * comparing, case-sensitive. Re-runs automatically whenever a child row's
 * value changes (Angular propagates child valueChanges up to the parent).
 */
const sizeLabelsUniqueValidator: ValidatorFn = (control) => {
  const rows = control as FormArray<FormGroup>;
  const seen = new Set<string>();
  for (const row of rows.controls) {
    const label = ((row.get('label')?.value as string) ?? '').trim();
    if (!label) continue; // empty labels are surfaced by the per-row `required` validator
    if (seen.has(label)) return { duplicateLabel: label };
    seen.add(label);
  }
  return null;
};

@Component({
  selector: 'app-vendor-products',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './vendor-products.html',
  styleUrl: './vendor-products.scss',
})
export class VendorProducts implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly vendorsService = inject(VendorsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly fb = inject(FormBuilder);

  // ─── Vendor identity ─────────────────────────────────────────────────────────
  /** vendorId from GET /vendors/me — used to filter the product list. */
  readonly vendorId = signal<string | null>(null);
  readonly vendorLoading = signal(true);
  readonly vendorError = signal<string | null>(null);

  // ─── Products state ──────────────────────────────────────────────────────────
  readonly allProducts = signal<ProductDto[]>([]);
  readonly productsLoading = signal(true);
  readonly productsError = signal<string | null>(null);

  /** Only this vendor's own listings. */
  readonly vendorProducts = computed(() => {
    const id = this.vendorId();
    if (!id) return [];
    return this.allProducts().filter(p => p.vendor?.id === id);
  });

  // ─── Categories (for the create/edit form) ───────────────────────────────────
  readonly categories = signal<CategoryDto[]>([]);
  readonly categoriesLoading = signal(true);

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
    /** Opt-in per-size stock rows (Product Sizing) — displayOrder is implicit (array index). */
    sizes: this.fb.array<FormGroup>([], sizeLabelsUniqueValidator),
  });

  /** Typed accessor for the `sizes` FormArray — nested FormGroups of { label, stockQuantity }. */
  get sizeRows(): FormArray<FormGroup> {
    return this.productForm.get('sizes') as FormArray<FormGroup>;
  }

  /** Image files selected for upload — create only; not used on edit. */
  readonly selectedImages = signal<File[]>([]);

  // ─── Delete guard ────────────────────────────────────────────────────────────
  readonly pendingDeleteProductId = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);

  // ─── Expose enums to template ────────────────────────────────────────────────
  readonly CurrencyCode = CurrencyCode;
  readonly CountryCode = CountryCode;

  ngOnInit(): void {
    this.loadVendorProfile();
    this.loadProducts();
    this.loadCategories();
  }

  // ─── Data loading ──────────────────────────────────────────────────────────

  private loadVendorProfile(): void {
    this.vendorLoading.set(true);
    this.vendorsService.getMe().subscribe({
      next: (vendor) => {
        this.vendorId.set(vendor.id);
        this.vendorLoading.set(false);
      },
      error: () => {
        this.vendorError.set('Could not load your vendor profile.');
        this.vendorLoading.set(false);
      },
    });
  }

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

  private loadCategories(): void {
    this.categoriesLoading.set(true);
    this.categoriesService.list().subscribe({
      next: (cats) => {
        this.categories.set(cats);
        this.categoriesLoading.set(false);
      },
      error: () => {
        // Categories failing is non-fatal — form just shows no categories.
        this.categoriesLoading.set(false);
      },
    });
  }

  // ─── Product form ─────────────────────────────────────────────────────────

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
    this.setSizeRows([]);
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
    this.setSizeRows(product.sizes ?? []);
    this.productFormError.set(null);
    this.productFormOpen.set(true);
  }

  // ─── Sizes (Product Sizing) ─────────────────────────────────────────────

  private createSizeRow(label = '', stockQuantity = 0): FormGroup {
    return this.fb.group({
      label: [label, Validators.required],
      stockQuantity: [stockQuantity, [Validators.required, Validators.min(0)]],
    });
  }

  /** Clears and rebuilds the sizes FormArray — used on open (create/edit), not a partial patch. */
  private setSizeRows(sizes: Array<{ label: string; stockQuantity: number }>): void {
    const rows = this.sizeRows;
    while (rows.length) rows.removeAt(0);
    for (const size of sizes) {
      rows.push(this.createSizeRow(size.label, size.stockQuantity));
    }
  }

  addSizeRow(): void {
    this.sizeRows.push(this.createSizeRow());
  }

  removeSizeRow(index: number): void {
    this.sizeRows.removeAt(index);
  }

  /** Vendor-controlled display order (not auto-sorted) — swaps this row with the one above it. */
  moveSizeRowUp(index: number): void {
    if (index <= 0) return;
    const rows = this.sizeRows;
    const row = rows.at(index);
    rows.removeAt(index);
    rows.insert(index - 1, row);
  }

  moveSizeRowDown(index: number): void {
    const rows = this.sizeRows;
    if (index >= rows.length - 1) return;
    const row = rows.at(index);
    rows.removeAt(index);
    rows.insert(index + 1, row);
  }

  /** `ProductSizeInput[]`, ordered by the current row order — displayOrder is the array index. */
  private sizesPayload(): ProductSizeInput[] {
    return this.sizeRows.getRawValue().map((row, index) => ({
      label: (row['label'] as string).trim(),
      stockQuantity: row['stockQuantity'] as number,
      displayOrder: index,
    }));
  }

  closeProductForm(): void {
    this.productFormOpen.set(false);
  }

  onImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedImages.set(input.files ? Array.from(input.files) : []);
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
      const sizes = this.sizesPayload();
      // vendorId is NOT included — server resolves it from the authenticated token.
      const payload = {
        name: raw.name as string,
        description: raw.description as string,
        price: raw.price as number,
        currency: raw.currency as CurrencyCode,
        stockQuantity: raw.stockQuantity as number,
        originCountry: raw.originCountry as CountryCode,
        categoryIds: (raw.categoryIds as string[]).length ? raw.categoryIds as string[] : undefined,
        // Opt-in: omitted (not an empty array) when no rows — product stays unsized.
        sizes: sizes.length ? sizes : undefined,
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
      const payload = {
        name: raw.name as string,
        description: raw.description as string,
        price: raw.price as number,
        currency: raw.currency as CurrencyCode,
        stockQuantity: raw.stockQuantity as number,
        originCountry: raw.originCountry as CountryCode,
        categoryIds: raw.categoryIds as string[],
        // Whole-list-replace on update — always sent (even []) so removing every row
        // actually clears sizes server-side instead of being silently ignored.
        sizes: this.sizesPayload(),
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

  // ─── Delete ───────────────────────────────────────────────────────────────

  confirmDeleteProduct(id: string): void {
    this.pendingDeleteProductId.set(id);
  }

  cancelDeleteProduct(): void {
    this.pendingDeleteProductId.set(null);
  }

  deleteProduct(id: string): void {
    this.deleteError.set(null);
    this.productsService.delete(id).subscribe({
      next: () => {
        this.allProducts.update(list => list.filter(p => p.id !== id));
        this.pendingDeleteProductId.set(null);
      },
      error: () => {
        this.pendingDeleteProductId.set(null);
        this.deleteError.set('Failed to delete product. Please try again.');
      },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  primaryImageUrl(product: ProductDto): string | null {
    const primary = product.images.find(img => img.isPrimary) ?? product.images[0];
    return primary?.url ?? null;
  }
}
