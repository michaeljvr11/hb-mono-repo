import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import {
  CategoryDto,
  CountryCode,
  CurrencyCode,
  ProductDto,
} from '@hb/shared';
import { ProductsService } from '../../../../core/api/products.service';
import { VendorsService } from '../../../../core/api/vendors.service';
import { CategoriesService } from '../../../../core/api/categories.service';

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
  });

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
    this.productsService.list().subscribe({
      next: (products) => {
        this.allProducts.set(products);
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
      // vendorId is NOT included — server resolves it from the authenticated token.
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
