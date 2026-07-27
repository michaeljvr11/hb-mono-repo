import { isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, WritableSignal, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { UpdateVendorRequest, VendorSelfDto } from '@hb/shared';
import { VendorsService } from '../../../../core/api/vendors.service';
import { extractErrorMessage } from '../../../../shared/extract-error-message';

/** Mirrors the server-side cap on VendorDto.slogan (VPC-1). */
const SLOGAN_MAX_LENGTH = 120;
/** Mirrors the server-side logo/banner upload constraint (VPC-1/VPC-2): jpg/jpeg/png/webp, 5MB. */
const ALLOWED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ImageKind = 'logo' | 'banner';

@Component({
  selector: 'app-vendor-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './vendor-profile.html',
  styleUrl: './vendor-profile.scss',
})
export class VendorProfile implements OnInit, OnDestroy {
  private readonly vendorsService = inject(VendorsService);
  private readonly fb = inject(FormBuilder);
  private readonly platformId = inject(PLATFORM_ID);

  readonly ALLOWED_IMAGE_TYPES = ALLOWED_IMAGE_TYPES;

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
        this.vendorLoading.set(false);
      },
      error: () => {
        this.vendorLoadError.set('Could not load your vendor profile. Please refresh the page.');
        this.vendorLoading.set(false);
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
