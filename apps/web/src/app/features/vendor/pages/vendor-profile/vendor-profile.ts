import { isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, WritableSignal, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ProductCategoryDto, ProductDto, UpdateVendorRequest, VendorProfileSection, VendorSectionType, VendorSelfDto } from '@hb/shared';
import { ProductsService } from '../../../../core/api/products.service';
import { VendorsService } from '../../../../core/api/vendors.service';
import { extractErrorMessage } from '../../../../shared/extract-error-message';

/** Mirrors the server-side cap on VendorDto.slogan (VPC-1). */
const SLOGAN_MAX_LENGTH = 120;
/** Mirrors the server-side logo/banner upload constraint (VPC-1/VPC-2): jpg/jpeg/png/webp, 5MB. */
const ALLOWED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ImageKind = 'logo' | 'banner';

/** Server-side max page size — avoids truncating the vendor's own product list for the section pickers. */
const PRODUCT_LIST_MAX = 100;
/** Mirrors the server-side cap on VendorDto.profileSections (VPC-1). */
const MAX_SECTIONS = 10;
/** Mirrors the server-side cap on VendorProfileSection.productIds for curated sections (VPC-1). */
const CURATED_PRODUCTS_MAX = 24;
/** UX-nudge presets only — free text is always allowed (spec: "no hardcoded section names"). */
const SECTION_TITLE_PRESETS = ['Top Picks', 'New Arrivals'];

@Component({
  selector: 'app-vendor-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './vendor-profile.html',
  styleUrl: './vendor-profile.scss',
})
export class VendorProfile implements OnInit, OnDestroy {
  private readonly vendorsService = inject(VendorsService);
  private readonly productsService = inject(ProductsService);
  private readonly fb = inject(FormBuilder);
  private readonly platformId = inject(PLATFORM_ID);

  readonly ALLOWED_IMAGE_TYPES = ALLOWED_IMAGE_TYPES;
  readonly VendorSectionType = VendorSectionType;
  readonly SECTION_TITLE_PRESETS = SECTION_TITLE_PRESETS;
  readonly MAX_SECTIONS = MAX_SECTIONS;
  readonly CURATED_PRODUCTS_MAX = CURATED_PRODUCTS_MAX;

  // ─── Vendor profile state ────────────────────────────────────────────────
  readonly vendor = signal<VendorSelfDto | null>(null);
  readonly vendorLoading = signal(true);
  readonly vendorLoadError = signal<string | null>(null);

  // ─── Details form ────────────────────────────────────────────────────────
  readonly profileForm = this.fb.nonNullable.group({
    businessName: ['', Validators.required],
    tradingName: [''],
    website: [''],
    description: [''],
    slogan: ['', Validators.maxLength(SLOGAN_MAX_LENGTH)],
  });

  readonly savePending = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly saveSuccess = signal<string | null>(null);

  // ─── Logo upload ─────────────────────────────────────────────────────────
  readonly logoPending = signal(false);
  readonly logoError = signal<string | null>(null);
  private readonly logoPreviewUrl = signal<string | null>(null);
  /** Newly-selected (unsaved) file preview if present, otherwise the persisted logo. */
  readonly logoDisplayUrl = computed(() => this.logoPreviewUrl() ?? this.vendor()?.logoUrl ?? null);

  // ─── Banner upload ───────────────────────────────────────────────────────
  readonly bannerPending = signal(false);
  readonly bannerError = signal<string | null>(null);
  private readonly bannerPreviewUrl = signal<string | null>(null);
  /** Newly-selected (unsaved) file preview if present, otherwise the persisted banner. */
  readonly bannerDisplayUrl = computed(() => this.bannerPreviewUrl() ?? this.vendor()?.bannerUrl ?? null);

  // ─── Product sections ────────────────────────────────────────────────────
  readonly sections = signal<VendorProfileSection[]>([]);
  readonly sectionsSaving = signal(false);
  readonly sectionsError = signal<string | null>(null);
  readonly sectionsSuccess = signal<string | null>(null);
  readonly canAddSection = computed(() => this.sections().length < MAX_SECTIONS);

  /** New-section draft fields. */
  readonly newSectionTitle = signal('');
  readonly newSectionType = signal<VendorSectionType>(VendorSectionType.CURATED);

  /** The vendor's own products — source for the curated picker and the category picker. */
  readonly vendorProducts = signal<ProductDto[]>([]);
  readonly vendorProductsLoading = signal(true);
  readonly vendorProductsError = signal<string | null>(null);

  /** Categories the vendor actually has products in (deduped), NOT the full platform catalog. */
  readonly vendorCategories = computed<ProductCategoryDto[]>(() => {
    const byId = new Map<string, ProductCategoryDto>();
    for (const product of this.vendorProducts()) {
      for (const category of product.categories) {
        if (!byId.has(category.id)) byId.set(category.id, category);
      }
    }
    return [...byId.values()];
  });

  ngOnInit(): void {
    this.loadVendorProfile();

    // A stale "saved" banner shouldn't linger once the user starts editing again.
    this.profileForm.valueChanges.subscribe(() => {
      this.saveSuccess.set(null);
      this.saveError.set(null);
    });
  }

  ngOnDestroy(): void {
    // Release any object URLs created for not-yet-uploaded file previews.
    this.revokePreview(this.logoPreviewUrl());
    this.revokePreview(this.bannerPreviewUrl());
  }

  // ─── Data loading ────────────────────────────────────────────────────────

  private loadVendorProfile(): void {
    this.vendorLoading.set(true);
    this.vendorLoadError.set(null);
    this.vendorsService.getMe().subscribe({
      next: (vendor) => {
        this.vendor.set(vendor);
        this.profileForm.patchValue({
          businessName: vendor.businessName,
          tradingName: vendor.tradingName ?? '',
          website: vendor.website ?? '',
          description: vendor.description ?? '',
          slogan: vendor.slogan ?? '',
        });
        this.sections.set(vendor.profileSections ?? []);
        this.vendorLoading.set(false);
        this.loadVendorProducts(vendor.id);
      },
      error: () => {
        this.vendorLoadError.set('Could not load your vendor profile. Please refresh the page.');
        this.vendorLoading.set(false);
      },
    });
  }

  private loadVendorProducts(vendorId: string): void {
    this.vendorProductsLoading.set(true);
    this.vendorProductsError.set(null);
    this.productsService.list({ vendorId, limit: PRODUCT_LIST_MAX }).subscribe({
      next: (res) => {
        this.vendorProducts.set(res.items);
        this.vendorProductsLoading.set(false);
      },
      error: () => {
        this.vendorProductsError.set('Failed to load your products. Curated/category pickers may be unavailable.');
        this.vendorProductsLoading.set(false);
      },
    });
  }

  // ─── Details form ────────────────────────────────────────────────────────

  submitProfile(): void {
    const vendor = this.vendor();
    if (this.profileForm.invalid || this.savePending() || !vendor) return;

    this.savePending.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(null);

    const raw = this.profileForm.getRawValue();
    const payload: UpdateVendorRequest = {
      businessName: raw.businessName,
      tradingName: raw.tradingName || undefined,
      website: raw.website || undefined,
      description: raw.description || undefined,
      slogan: raw.slogan || undefined,
    };

    this.vendorsService.update(vendor.id, payload)
      .pipe(finalize(() => this.savePending.set(false)))
      .subscribe({
        next: (updated) => {
          this.vendor.set(updated);
          this.saveSuccess.set('Profile changes saved.');
        },
        error: (err: unknown) => {
          this.saveError.set(extractErrorMessage(err) ?? 'Failed to save profile changes. Please try again.');
        },
      });
  }

  // ─── Product sections ────────────────────────────────────────────────────

  applyPreset(title: string): void {
    this.newSectionTitle.set(title);
  }

  addSection(): void {
    const title = this.newSectionTitle().trim();
    if (!title || !this.canAddSection()) return;

    const section: VendorProfileSection = {
      id: crypto.randomUUID(),
      title,
      type: this.newSectionType(),
    };
    this.updateSections((list) => [...list, section]);
    this.newSectionTitle.set('');
    this.newSectionType.set(VendorSectionType.CURATED);
  }

  renameSection(id: string, event: Event): void {
    const title = (event.target as HTMLInputElement).value;
    this.updateSections((list) => list.map((s) => (s.id === id ? { ...s, title } : s)));
  }

  removeSection(id: string): void {
    this.updateSections((list) => list.filter((s) => s.id !== id));
  }

  moveSection(index: number, direction: -1 | 1): void {
    this.updateSections((list) => this.swap(list, index, index + direction));
  }

  setSectionCategory(id: string, categoryId: string): void {
    this.updateSections((list) => list.map((s) => (s.id === id ? { ...s, categoryId } : s)));
  }

  addProductToSection(sectionId: string, productId: string): void {
    this.updateSections((list) =>
      list.map((s) => {
        if (s.id !== sectionId) return s;
        const current = s.productIds ?? [];
        if (current.includes(productId) || current.length >= CURATED_PRODUCTS_MAX) return s;
        return { ...s, productIds: [...current, productId] };
      }),
    );
  }

  removeProductFromSection(sectionId: string, productId: string): void {
    this.updateSections((list) =>
      list.map((s) =>
        s.id === sectionId ? { ...s, productIds: (s.productIds ?? []).filter((id) => id !== productId) } : s,
      ),
    );
  }

  moveProductInSection(sectionId: string, index: number, direction: -1 | 1): void {
    this.updateSections((list) =>
      list.map((s) => (s.id === sectionId ? { ...s, productIds: this.swap(s.productIds ?? [], index, index + direction) } : s)),
    );
  }

  /** Products already picked for a curated section, resolved in order (dangling ids silently dropped). */
  sectionProducts(section: VendorProfileSection): ProductDto[] {
    return (section.productIds ?? [])
      .map((id) => this.vendorProducts().find((p) => p.id === id))
      .filter((p): p is ProductDto => !!p);
  }

  /** The vendor's own products not yet picked for this curated section. */
  availableProductsForSection(section: VendorProfileSection): ProductDto[] {
    const picked = new Set(section.productIds ?? []);
    return this.vendorProducts().filter((p) => !picked.has(p.id));
  }

  saveSections(): void {
    const vendor = this.vendor();
    if (!vendor || this.sectionsSaving()) return;

    this.sectionsSaving.set(true);
    this.sectionsError.set(null);
    this.sectionsSuccess.set(null);

    this.vendorsService.update(vendor.id, { profileSections: this.sections() })
      .pipe(finalize(() => this.sectionsSaving.set(false)))
      .subscribe({
        next: (updated) => {
          this.vendor.set(updated);
          this.sections.set(updated.profileSections ?? []);
          this.sectionsSuccess.set('Product sections saved.');
        },
        error: (err: unknown) => {
          this.sectionsError.set(extractErrorMessage(err) ?? 'Failed to save product sections. Please try again.');
        },
      });
  }

  /** Swaps two array elements immutably; no-op (returns the same list) if either index is out of range. */
  private swap<T>(list: T[], a: number, b: number): T[] {
    if (a < 0 || b < 0 || a >= list.length || b >= list.length) return list;
    const copy = [...list];
    [copy[a], copy[b]] = [copy[b], copy[a]];
    return copy;
  }

  /** Mutates sections and clears any stale save banner, mirroring the details-form editing convention. */
  private updateSections(updater: (list: VendorProfileSection[]) => VendorProfileSection[]): void {
    this.sections.update(updater);
    this.sectionsSuccess.set(null);
    this.sectionsError.set(null);
  }

  // ─── Logo / banner upload ────────────────────────────────────────────────

  onLogoSelected(event: Event): void {
    this.uploadImage('logo', event);
  }

  onBannerSelected(event: Event): void {
    this.uploadImage('banner', event);
  }

  private uploadImage(kind: ImageKind, event: Event): void {
    const file = this.pickFile(event);
    if (!file) return;

    const pending = kind === 'logo' ? this.logoPending : this.bannerPending;
    const error = kind === 'logo' ? this.logoError : this.bannerError;
    const preview = kind === 'logo' ? this.logoPreviewUrl : this.bannerPreviewUrl;

    error.set(null);
    if (file.size > MAX_IMAGE_BYTES) {
      error.set('File is too large. Max 5MB.');
      return;
    }
    this.setPreview(preview, file);
    pending.set(true);

    const upload$ = kind === 'logo' ? this.vendorsService.uploadLogo(file) : this.vendorsService.uploadBanner(file);
    upload$
      .pipe(finalize(() => pending.set(false)))
      .subscribe({
        next: (updated) => {
          this.vendor.set(updated);
          this.revokePreview(preview());
          preview.set(null);
        },
        error: (err: unknown) => {
          error.set(extractErrorMessage(err) ?? `Failed to upload ${kind}. Please try again.`);
          this.revokePreview(preview());
          preview.set(null);
        },
      });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private pickFile(event: Event): File | null {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = ''; // allow re-selecting the same file again later
    return file;
  }

  /** SSR-safe: URL.createObjectURL only exists in the browser. */
  private setPreview(previewSignal: WritableSignal<string | null>, file: File): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.revokePreview(previewSignal());
    previewSignal.set(URL.createObjectURL(file));
  }

  private revokePreview(url: string | null): void {
    if (url && isPlatformBrowser(this.platformId)) {
      URL.revokeObjectURL(url);
    }
  }
}
