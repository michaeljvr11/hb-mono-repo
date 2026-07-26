import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import {
  CategoryDto,
  CountryCode,
  CurrencyCode,
  ListingType,
  ProductDto,
} from '@hb/shared';
import { ProductsService } from '../../../../core/api/products.service';
import { CategoriesService } from '../../../../core/api/categories.service';

type CatalogView = 'products' | 'categories';

/** Server-side max page size — used to avoid truncating the admin catalog list. */
const PRODUCT_LIST_MAX = 100;

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
