import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, Subject, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { CountryCode, VendorSelfDto, VendorStatus } from '@hb/shared';

import { VendorProfile } from './vendor-profile';
import { VendorsService } from '../../../../core/api/vendors.service';

// jsdom (the vitest test DOM) doesn't implement the URL object-URL APIs —
// stub them so the SSR-guarded preview logic can run under test.
beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url');
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = vi.fn();
  }
});

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_VENDOR: VendorSelfDto = {
  id: 'vendor-1',
  businessName: 'My Store',
  tradingName: 'My Store Trading',
  status: VendorStatus.APPROVED,
  countryCode: CountryCode.SOUTH_AFRICA,
  website: 'https://mystore.example',
  description: 'We sell great things.',
  slogan: 'Quality you can trust',
  logoUrl: 'https://cdn.example/logo.png',
  bannerUrl: 'https://cdn.example/banner.png',
};

// ─── Stub interface ──────────────────────────────────────────────────────────

interface VendorsStub {
  getMe: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  uploadLogo: ReturnType<typeof vi.fn>;
  uploadBanner: ReturnType<typeof vi.fn>;
}

function makeVendorsStub(): VendorsStub {
  return {
    getMe: vi.fn(() => of(MOCK_VENDOR)),
    update: vi.fn(),
    uploadLogo: vi.fn(),
    uploadBanner: vi.fn(),
  };
}

async function setupTestBed(vendorsStub: VendorsStub): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [VendorProfile],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: VendorsService, useValue: vendorsStub },
    ],
  }).compileComponents();
}

// ─── Main suite ───────────────────────────────────────────────────────────────

describe('VendorProfile component', () => {
  let component: VendorProfile;
  let fixture: ComponentFixture<VendorProfile>;
  let vendorsStub: VendorsStub;

  beforeEach(async () => {
    vendorsStub = makeVendorsStub();
    await setupTestBed(vendorsStub);
    fixture = TestBed.createComponent(VendorProfile);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── Loading the profile ────────────────────────────────────────────────

  describe('loading the profile', () => {
    it('loads via GET /vendors/me and populates the form', () => {
      expect(vendorsStub.getMe).toHaveBeenCalledTimes(1);
      expect(component.vendorLoading()).toBe(false);
      expect(component.vendor()?.id).toBe('vendor-1');
      expect(component.profileForm.value).toEqual({
        businessName: 'My Store',
        tradingName: 'My Store Trading',
        website: 'https://mystore.example',
        description: 'We sell great things.',
        slogan: 'Quality you can trust',
      });
    });

    it('shows current logo/banner urls as the display urls', () => {
      expect(component.logoDisplayUrl()).toBe('https://cdn.example/logo.png');
      expect(component.bannerDisplayUrl()).toBe('https://cdn.example/banner.png');
    });
  });

  // ── Saving the details form ────────────────────────────────────────────

  describe('submitProfile', () => {
    it('calls VendorsService.update with vendor.id and the current form values', async () => {
      const updated = { ...MOCK_VENDOR, businessName: 'Renamed Store' };
      vendorsStub.update.mockReturnValue(of(updated));

      component.profileForm.patchValue({ businessName: 'Renamed Store' });
      component.submitProfile();
      await fixture.whenStable();

      expect(vendorsStub.update).toHaveBeenCalledTimes(1);
      const [id, payload] = vendorsStub.update.mock.calls[0] as [string, Record<string, unknown>];
      expect(id).toBe('vendor-1');
      expect(payload).toEqual({
        businessName: 'Renamed Store',
        tradingName: 'My Store Trading',
        website: 'https://mystore.example',
        description: 'We sell great things.',
        slogan: 'Quality you can trust',
      });
    });

    it('sets saveSuccess and updates local vendor state on success', async () => {
      const updated = { ...MOCK_VENDOR, businessName: 'Renamed Store' };
      vendorsStub.update.mockReturnValue(of(updated));

      component.profileForm.patchValue({ businessName: 'Renamed Store' });
      component.submitProfile();
      await fixture.whenStable();

      expect(component.saveSuccess()).toBeTruthy();
      expect(component.saveError()).toBeNull();
      expect(component.vendor()?.businessName).toBe('Renamed Store');
      expect(component.savePending()).toBe(false);
    });

    it('sets saveError and clears savePending when update() fails', async () => {
      vendorsStub.update.mockReturnValue(throwError(() => new Error('500')));

      component.submitProfile();
      await fixture.whenStable();

      expect(component.saveError()).toBeTruthy();
      expect(component.saveSuccess()).toBeNull();
      expect(component.savePending()).toBe(false);
    });

    it('does not submit when businessName is cleared (required)', () => {
      component.profileForm.patchValue({ businessName: '' });
      component.submitProfile();

      expect(vendorsStub.update).not.toHaveBeenCalled();
    });

    it('does not double-submit while a save is pending', async () => {
      // Keep the first call in flight so the pending guard is actually exercised.
      const pending$ = new Subject<VendorSelfDto>();
      vendorsStub.update.mockReturnValue(pending$);

      component.submitProfile();
      component.submitProfile();
      pending$.next(MOCK_VENDOR);
      pending$.complete();
      await fixture.whenStable();

      expect(vendorsStub.update).toHaveBeenCalledTimes(1);
    });
  });

  // ── Logo upload ─────────────────────────────────────────────────────────

  describe('logo upload', () => {
    function fileChangeEvent(file: File): Event {
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: [file] });
      return { target: input } as unknown as Event;
    }

    it('calls VendorsService.uploadLogo with the selected file and updates vendor on success', async () => {
      const file = new File(['a'], 'logo.png', { type: 'image/png' });
      const updated = { ...MOCK_VENDOR, logoUrl: 'https://cdn.example/logo-new.png' };
      vendorsStub.uploadLogo.mockReturnValue(of(updated));

      component.onLogoSelected(fileChangeEvent(file));
      await fixture.whenStable();

      expect(vendorsStub.uploadLogo).toHaveBeenCalledWith(file);
      expect(component.vendor()?.logoUrl).toBe('https://cdn.example/logo-new.png');
      expect(component.logoPending()).toBe(false);
      expect(component.logoError()).toBeNull();
    });

    it('sets logoError when the upload fails (e.g. wrong type / too large)', async () => {
      const file = new File(['a'], 'logo.exe', { type: 'application/octet-stream' });
      vendorsStub.uploadLogo.mockReturnValue(
        throwError(() => ({ error: { message: 'Only jpg, jpeg, png and webp files are allowed' } })),
      );

      component.onLogoSelected(fileChangeEvent(file));
      await fixture.whenStable();

      expect(component.logoError()).toBe('Only jpg, jpeg, png and webp files are allowed');
      expect(component.logoPending()).toBe(false);
    });

    it('does nothing when no file is selected', () => {
      const input = document.createElement('input');
      input.type = 'file';
      component.onLogoSelected({ target: input } as unknown as Event);

      expect(vendorsStub.uploadLogo).not.toHaveBeenCalled();
    });
  });

  // ── Banner upload ───────────────────────────────────────────────────────

  describe('banner upload', () => {
    function fileChangeEvent(file: File): Event {
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: [file] });
      return { target: input } as unknown as Event;
    }

    it('calls VendorsService.uploadBanner with the selected file and updates vendor on success', async () => {
      const file = new File(['a'], 'banner.jpg', { type: 'image/jpeg' });
      const updated = { ...MOCK_VENDOR, bannerUrl: 'https://cdn.example/banner-new.png' };
      vendorsStub.uploadBanner.mockReturnValue(of(updated));

      component.onBannerSelected(fileChangeEvent(file));
      await fixture.whenStable();

      expect(vendorsStub.uploadBanner).toHaveBeenCalledWith(file);
      expect(component.vendor()?.bannerUrl).toBe('https://cdn.example/banner-new.png');
      expect(component.bannerPending()).toBe(false);
      expect(component.bannerError()).toBeNull();
    });

    it('sets bannerError when the upload fails', async () => {
      const file = new File(['a'.repeat(10)], 'banner.png', { type: 'image/png' });
      vendorsStub.uploadBanner.mockReturnValue(
        throwError(() => ({ error: { message: 'File too large' } })),
      );

      component.onBannerSelected(fileChangeEvent(file));
      await fixture.whenStable();

      expect(component.bannerError()).toBe('File too large');
      expect(component.bannerPending()).toBe(false);
    });
  });
});

// ─── Error path: vendor profile load failure ──────────────────────────────────

describe('VendorProfile — vendor profile load error', () => {
  it('sets vendorLoadError and clears vendorLoading when getMe() fails', async () => {
    const failStub = makeVendorsStub();
    failStub.getMe.mockReturnValue(throwError(() => new Error('500')));
    await setupTestBed(failStub);

    const failFixture = TestBed.createComponent(VendorProfile);
    const failComponent = failFixture.componentInstance;
    failFixture.detectChanges();
    await failFixture.whenStable();

    expect(failComponent.vendorLoading()).toBe(false);
    expect(failComponent.vendorLoadError()).toBeTruthy();
    expect(failComponent.vendor()).toBeNull();
  });
});
