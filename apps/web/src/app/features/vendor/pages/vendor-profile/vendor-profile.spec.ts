import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
  CountryCode,
  CurrencyCode,
  ListingType,
  PagedResponse,
  ProductDto,
  VendorProfileSection,
  VendorSectionType,
  VendorSelfDto,
  VendorStatus,
} from '@hb/shared';

import { VendorProfile } from './vendor-profile';
import { ProductsService } from '../../../../core/api/products.service';
import { VendorsService } from '../../../../core/api/vendors.service';

// jsdom (the vitest test DOM) may not implement the URL object-URL APIs, and where it
// does, the real implementation produces non-deterministic ids — stub both consistently
// so the SSR-guarded preview logic is both runnable and assertable under test.
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url');
  URL.revokeObjectURL = vi.fn();
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
  profileSections: [],
};

const MOCK_PRODUCTS: ProductDto[] = [
  {
    id: 'product-1',
    name: 'Widget A',
    description: 'A fine widget.',
    price: 100,
    currency: CurrencyCode.ZAR,
    stockQuantity: 5,
    originCountry: CountryCode.SOUTH_AFRICA,
    listingType: ListingType.VENDOR,
    images: [],
    vendor: { id: 'vendor-1', businessName: 'My Store' },
    categories: [{ id: 'cat-1', name: 'Widgets' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'product-2',
    name: 'Widget B',
    description: 'Another fine widget.',
    price: 200,
    currency: CurrencyCode.ZAR,
    stockQuantity: 3,
    originCountry: CountryCode.SOUTH_AFRICA,
    listingType: ListingType.VENDOR,
    images: [],
    vendor: { id: 'vendor-1', businessName: 'My Store' },
    categories: [{ id: 'cat-2', name: 'Gadgets' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const MOCK_PRODUCTS_PAGE: PagedResponse<ProductDto> = {
  items: MOCK_PRODUCTS,
  total: MOCK_PRODUCTS.length,
  page: 1,
  limit: 100,
};

function fileChangeEvent(file: File): Event {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: [file] });
  return { target: input } as unknown as Event;
}

// ─── Stub interfaces ──────────────────────────────────────────────────────────

interface VendorsStub {
  getMe: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  uploadLogo: ReturnType<typeof vi.fn>;
  uploadBanner: ReturnType<typeof vi.fn>;
}

interface ProductsStub {
  list: ReturnType<typeof vi.fn>;
}

function makeVendorsStub(): VendorsStub {
  return {
    getMe: vi.fn(() => of(MOCK_VENDOR)),
    update: vi.fn(),
    uploadLogo: vi.fn(),
    uploadBanner: vi.fn(),
  };
}

function makeProductsStub(): ProductsStub {
  return {
    list: vi.fn(() => of(MOCK_PRODUCTS_PAGE)),
  };
}

async function setupTestBed(vendorsStub: VendorsStub, productsStub: ProductsStub = makeProductsStub()): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [VendorProfile],
    providers: [
      { provide: VendorsService, useValue: vendorsStub },
      { provide: ProductsService, useValue: productsStub },
    ],
  }).compileComponents();
}

// ─── Main suite ───────────────────────────────────────────────────────────────

describe('VendorProfile component', () => {
  let component: VendorProfile;
  let fixture: ComponentFixture<VendorProfile>;
  let vendorsStub: VendorsStub;
  let productsStub: ProductsStub;

  beforeEach(async () => {
    vendorsStub = makeVendorsStub();
    productsStub = makeProductsStub();
    await setupTestBed(vendorsStub, productsStub);
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

    it('omits blank optional fields from the payload rather than sending empty strings', async () => {
      vendorsStub.update.mockReturnValue(of(MOCK_VENDOR));

      component.profileForm.patchValue({ tradingName: '', website: '', description: '', slogan: '' });
      component.submitProfile();
      await fixture.whenStable();

      const [, payload] = vendorsStub.update.mock.calls[0] as [string, Record<string, unknown>];
      expect(payload).toEqual({
        businessName: 'My Store',
        tradingName: undefined,
        website: undefined,
        description: undefined,
        slogan: undefined,
      });
    });

    it('sets saveSuccess and replaces local vendor state with the server response on success', async () => {
      // Server-normalised response — deliberately differs from what was sent, to prove
      // the component trusts the response rather than echoing local form values back.
      const updated = { ...MOCK_VENDOR, businessName: 'Renamed Store', website: 'https://normalised.example' };
      vendorsStub.update.mockReturnValue(of(updated));

      component.profileForm.patchValue({ businessName: 'Renamed Store' });
      component.submitProfile();
      await fixture.whenStable();

      expect(component.saveSuccess()).toBeTruthy();
      expect(component.saveError()).toBeNull();
      expect(component.vendor()).toEqual(updated);
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

    it('rejects a slogan longer than 120 characters', () => {
      component.profileForm.patchValue({ slogan: 'x'.repeat(121) });
      expect(component.profileForm.get('slogan')?.hasError('maxlength')).toBe(true);
      expect(component.profileForm.invalid).toBe(true);
    });

    it('clears a stale success/error banner once the user edits the form again', async () => {
      vendorsStub.update.mockReturnValue(of(MOCK_VENDOR));
      component.submitProfile();
      await fixture.whenStable();
      expect(component.saveSuccess()).toBeTruthy();

      component.profileForm.patchValue({ businessName: 'Something else' });

      expect(component.saveSuccess()).toBeNull();
    });
  });

  // ── Logo upload ─────────────────────────────────────────────────────────

  describe('logo upload', () => {
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

    it('shows a local preview immediately, then swaps to the persisted url on success', async () => {
      const file = new File(['a'], 'logo.png', { type: 'image/png' });
      const pending$ = new Subject<VendorSelfDto>();
      vendorsStub.uploadLogo.mockReturnValue(pending$);

      component.onLogoSelected(fileChangeEvent(file));
      expect(component.logoDisplayUrl()).toBe('blob:mock-preview-url');

      const updated = { ...MOCK_VENDOR, logoUrl: 'https://cdn.example/logo-new.png' };
      pending$.next(updated);
      pending$.complete();
      await fixture.whenStable();

      expect(component.logoDisplayUrl()).toBe('https://cdn.example/logo-new.png');
    });

    it('sets logoError and falls back to the persisted logo when the upload fails', async () => {
      const file = new File(['a'], 'logo.exe', { type: 'application/octet-stream' });
      vendorsStub.uploadLogo.mockReturnValue(
        throwError(() => ({ error: { message: 'Only jpg, jpeg, png and webp files are allowed' } })),
      );

      component.onLogoSelected(fileChangeEvent(file));
      await fixture.whenStable();

      expect(component.logoError()).toBe('Only jpg, jpeg, png and webp files are allowed');
      expect(component.logoPending()).toBe(false);
      // The rejected file must not stay rendered as if it were live.
      expect(component.logoDisplayUrl()).toBe('https://cdn.example/logo.png');
    });

    it('rejects a file over 5MB client-side without calling the service', () => {
      const bigFile = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'logo.png', { type: 'image/png' });

      component.onLogoSelected(fileChangeEvent(bigFile));

      expect(vendorsStub.uploadLogo).not.toHaveBeenCalled();
      expect(component.logoError()).toContain('too large');
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

    it('sets bannerError and falls back to the persisted banner when the upload fails', async () => {
      const file = new File(['a'.repeat(10)], 'banner.png', { type: 'image/png' });
      vendorsStub.uploadBanner.mockReturnValue(
        throwError(() => ({ error: { message: 'File too large' } })),
      );

      component.onBannerSelected(fileChangeEvent(file));
      await fixture.whenStable();

      expect(component.bannerError()).toBe('File too large');
      expect(component.bannerPending()).toBe(false);
      expect(component.bannerDisplayUrl()).toBe('https://cdn.example/banner.png');
    });
  });

  // ── Product sections ────────────────────────────────────────────────────

  describe('product sections', () => {
    it('fetches the vendor\'s own products, scoped by vendorId', () => {
      expect(productsStub.list).toHaveBeenCalledWith({ vendorId: 'vendor-1', limit: 100 });
    });

    it('seeds sections from vendor.profileSections on load', async () => {
      const seeded: VendorProfileSection[] = [
        { id: 'sec-1', title: 'Top Picks', type: VendorSectionType.CURATED, productIds: ['product-1'] },
      ];
      vendorsStub.getMe.mockReturnValue(of({ ...MOCK_VENDOR, profileSections: seeded }));
      TestBed.resetTestingModule();
      await setupTestBed(vendorsStub, productsStub);
      const seededFixture = TestBed.createComponent(VendorProfile);
      seededFixture.detectChanges();
      await seededFixture.whenStable();

      expect(seededFixture.componentInstance.sections()).toEqual(seeded);
    });

    it('derives vendorCategories from the fetched products, deduped', () => {
      expect(component.vendorCategories()).toEqual([
        { id: 'cat-1', name: 'Widgets' },
        { id: 'cat-2', name: 'Gadgets' },
      ]);
    });

    it('adds a curated section with a generated id and the chosen type/title', () => {
      component.newSectionTitle.set('Top Picks');
      component.newSectionType.set(VendorSectionType.CURATED);
      component.addSection();

      expect(component.sections().length).toBe(1);
      expect(component.sections()[0]).toMatchObject({ title: 'Top Picks', type: VendorSectionType.CURATED });
      expect(component.sections()[0].id).toBeTruthy();
      // Draft fields reset after adding.
      expect(component.newSectionTitle()).toBe('');
    });

    it('does not add a section with a blank title', () => {
      component.newSectionTitle.set('   ');
      component.addSection();

      expect(component.sections().length).toBe(0);
    });

    it('applyPreset prefills (does not force) the title field', () => {
      component.applyPreset('New Arrivals');
      expect(component.newSectionTitle()).toBe('New Arrivals');

      // User can still overwrite it with free text.
      component.newSectionTitle.set('Something Else');
      expect(component.newSectionTitle()).toBe('Something Else');
    });

    it('reorders sections up and down', () => {
      component.newSectionTitle.set('Section A');
      component.addSection();
      component.newSectionTitle.set('Section B');
      component.addSection();

      expect(component.sections().map(s => s.title)).toEqual(['Section A', 'Section B']);

      component.moveSection(1, -1);
      expect(component.sections().map(s => s.title)).toEqual(['Section B', 'Section A']);

      component.moveSection(0, -1); // already at top — no-op
      expect(component.sections().map(s => s.title)).toEqual(['Section B', 'Section A']);
    });

    it('renames a section inline', () => {
      component.newSectionTitle.set('Original');
      component.addSection();
      const id = component.sections()[0].id;

      component.renameSection(id, { target: { value: 'Renamed' } } as unknown as Event);

      expect(component.sections()[0].title).toBe('Renamed');
    });

    it('deletes a section', () => {
      component.newSectionTitle.set('Doomed');
      component.addSection();
      const id = component.sections()[0].id;

      component.removeSection(id);

      expect(component.sections()).toEqual([]);
    });

    it('curated picker only ever offers the vendor\'s own products', () => {
      component.newSectionTitle.set('Top Picks');
      component.newSectionType.set(VendorSectionType.CURATED);
      component.addSection();
      const section = component.sections()[0];

      const available = component.availableProductsForSection(section);
      expect(available.map(p => p.id)).toEqual(['product-1', 'product-2']);
    });

    it('adds and removes products from a curated section, and reorders them', () => {
      component.newSectionTitle.set('Top Picks');
      component.addSection();
      const id = component.sections()[0].id;

      component.addProductToSection(id, 'product-1');
      component.addProductToSection(id, 'product-2');
      expect(component.sections()[0].productIds).toEqual(['product-1', 'product-2']);

      component.moveProductInSection(id, 1, -1);
      expect(component.sections()[0].productIds).toEqual(['product-2', 'product-1']);

      component.removeProductFromSection(id, 'product-2');
      expect(component.sections()[0].productIds).toEqual(['product-1']);
    });

    it('does not add the same product twice to a curated section', () => {
      component.newSectionTitle.set('Top Picks');
      component.addSection();
      const id = component.sections()[0].id;

      component.addProductToSection(id, 'product-1');
      component.addProductToSection(id, 'product-1');

      expect(component.sections()[0].productIds).toEqual(['product-1']);
    });

    it('sets categoryId on a category section', () => {
      component.newSectionTitle.set('Gadgets Zone');
      component.newSectionType.set(VendorSectionType.CATEGORY);
      component.addSection();
      const id = component.sections()[0].id;

      component.setSectionCategory(id, 'cat-2');

      expect(component.sections()[0].categoryId).toBe('cat-2');
    });

    it('saveSections calls VendorsService.update with the id and the current sections array', () => {
      const section: VendorProfileSection = { id: 'sec-1', title: 'Top Picks', type: VendorSectionType.CURATED, productIds: ['product-1'] };
      component.sections.set([section]);
      vendorsStub.update.mockReturnValue(of({ ...MOCK_VENDOR, profileSections: [section] }));

      component.saveSections();

      expect(vendorsStub.update).toHaveBeenCalledWith('vendor-1', { profileSections: [section] });
    });

    it('saving an empty sections array is valid', () => {
      component.sections.set([]);
      vendorsStub.update.mockReturnValue(of({ ...MOCK_VENDOR, profileSections: [] }));

      component.saveSections();

      expect(vendorsStub.update).toHaveBeenCalledWith('vendor-1', { profileSections: [] });
    });

    it('on save success, trusts the server response for both vendor and sections state', async () => {
      const serverSections: VendorProfileSection[] = [
        { id: 'sec-server', title: 'Server Normalised', type: VendorSectionType.CATEGORY, categoryId: 'cat-1' },
      ];
      vendorsStub.update.mockReturnValue(of({ ...MOCK_VENDOR, profileSections: serverSections }));

      component.saveSections();
      await fixture.whenStable();

      expect(component.sections()).toEqual(serverSections);
      expect(component.vendor()?.profileSections).toEqual(serverSections);
      expect(component.sectionsSuccess()).toBeTruthy();
      expect(component.sectionsError()).toBeNull();
      expect(component.sectionsSaving()).toBe(false);
    });

    it('sets sectionsError and clears sectionsSaving when the save fails', async () => {
      vendorsStub.update.mockReturnValue(throwError(() => new Error('500')));

      component.saveSections();
      await fixture.whenStable();

      expect(component.sectionsError()).toBeTruthy();
      expect(component.sectionsSuccess()).toBeNull();
      expect(component.sectionsSaving()).toBe(false);
    });

    it('does not double-submit while a sections save is pending', async () => {
      const pending$ = new Subject<VendorSelfDto>();
      vendorsStub.update.mockReturnValue(pending$);

      component.saveSections();
      component.saveSections();
      pending$.next(MOCK_VENDOR);
      pending$.complete();
      await fixture.whenStable();

      expect(vendorsStub.update).toHaveBeenCalledTimes(1);
    });

    it('clears a stale sections success/error banner once the list is edited again', async () => {
      vendorsStub.update.mockReturnValue(of(MOCK_VENDOR));
      component.saveSections();
      await fixture.whenStable();
      expect(component.sectionsSuccess()).toBeTruthy();

      component.newSectionTitle.set('New Section');
      component.addSection();

      expect(component.sectionsSuccess()).toBeNull();
    });
  });

  // ── Rendered banners ────────────────────────────────────────────────────

  describe('rendered state', () => {
    it('renders a success banner in the DOM after a successful save', async () => {
      vendorsStub.update.mockReturnValue(of(MOCK_VENDOR));
      component.submitProfile();
      await fixture.whenStable();
      fixture.detectChanges();

      const success = fixture.nativeElement.querySelector('.success-banner');
      expect(success?.textContent).toContain('Profile changes saved.');
    });

    it('disables the submit button while a save is pending', async () => {
      const pending$ = new Subject<VendorSelfDto>();
      vendorsStub.update.mockReturnValue(pending$);

      component.submitProfile();
      fixture.detectChanges();

      const submitBtn: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
      expect(submitBtn.disabled).toBe(true);

      pending$.next(MOCK_VENDOR);
      pending$.complete();
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
