import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
  AuthUser,
  CountryCode,
  CurrencyCode,
  ListingType,
  PagedResponse,
  ProductDto,
  UserRole,
  VendorProfileSection,
  VendorSectionType,
  VendorSelfDto,
  VendorStatus,
} from '@hb/shared';

import { VendorProfile } from './vendor-profile';
import { AuthService } from '../../../../core/auth/auth.service';
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

const MOCK_USER: AuthUser = {
  id: 'user-1',
  email: 'signed-in@example.com',
  role: UserRole.VENDOR,
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

interface AuthStub {
  currentUser$: Observable<AuthUser | null>;
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

function makeAuthStub(user: AuthUser | null = MOCK_USER): AuthStub {
  return { currentUser$: of(user) };
}

async function setupTestBed(
  vendorsStub: VendorsStub,
  productsStub: ProductsStub = makeProductsStub(),
  authStub: AuthStub = makeAuthStub(),
): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [VendorProfile],
    providers: [
      { provide: VendorsService, useValue: vendorsStub },
      { provide: ProductsService, useValue: productsStub },
      { provide: AuthService, useValue: authStub },
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
        notificationEmail: '',
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
        notificationEmail: null,
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
        notificationEmail: null,
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

  // ── Notification email (TE-3) ──────────────────────────────────────────

  describe('notification email', () => {
    it('renders the current override value in the form', async () => {
      vendorsStub.getMe.mockReturnValue(of({ ...MOCK_VENDOR, notificationEmail: 'orders@mystore.example' }));
      TestBed.resetTestingModule();
      await setupTestBed(vendorsStub, productsStub);
      const overrideFixture = TestBed.createComponent(VendorProfile);
      overrideFixture.detectChanges();
      await overrideFixture.whenStable();

      expect(overrideFixture.componentInstance.profileForm.get('notificationEmail')?.value).toBe(
        'orders@mystore.example',
      );
    });

    it('renders blank, with the account-email fallback shown, when no override is set', () => {
      // MOCK_VENDOR has no notificationEmail — vendor.notificationEmail ?? '' patches the control blank.
      expect(component.profileForm.get('notificationEmail')?.value).toBe('');
      expect(component.accountEmail()).toBe('signed-in@example.com');

      fixture.detectChanges();
      const hint: HTMLElement = fixture.nativeElement.querySelector('#vp-notificationEmail')
        .closest('.field')
        .querySelector('.field-hint');
      expect(hint.textContent).toContain('signed-in@example.com');
    });

    it('saves a new override address', async () => {
      const updated = { ...MOCK_VENDOR, notificationEmail: 'orders@mystore.example' };
      vendorsStub.update.mockReturnValue(of(updated));

      component.profileForm.patchValue({ notificationEmail: 'orders@mystore.example' });
      component.submitProfile();
      await fixture.whenStable();

      const [, payload] = vendorsStub.update.mock.calls[0] as [string, Record<string, unknown>];
      expect(payload['notificationEmail']).toBe('orders@mystore.example');
      expect(component.saveSuccess()).toBeTruthy();
      expect(component.vendor()?.notificationEmail).toBe('orders@mystore.example');
    });

    it('clears an existing override back to the account-email default by sending null, not empty string or undefined', async () => {
      vendorsStub.getMe.mockReturnValue(of({ ...MOCK_VENDOR, notificationEmail: 'orders@mystore.example' }));
      TestBed.resetTestingModule();
      await setupTestBed(vendorsStub, productsStub);
      const seededFixture = TestBed.createComponent(VendorProfile);
      const seededComponent = seededFixture.componentInstance;
      seededFixture.detectChanges();
      await seededFixture.whenStable();

      vendorsStub.update.mockReturnValue(of({ ...MOCK_VENDOR, notificationEmail: null }));
      seededComponent.profileForm.patchValue({ notificationEmail: '' });
      seededComponent.submitProfile();
      await seededFixture.whenStable();

      const [, payload] = vendorsStub.update.mock.calls[0] as [string, Record<string, unknown>];
      expect(payload['notificationEmail']).toBeNull();
      expect(payload['notificationEmail']).not.toBe('');
      expect(payload['notificationEmail']).not.toBeUndefined();
    });

    it('surfaces a client-side validation error for a malformed address without submitting', () => {
      component.profileForm.patchValue({ notificationEmail: 'not-an-email' });

      expect(component.profileForm.get('notificationEmail')?.hasError('email')).toBe(true);
      expect(component.profileForm.invalid).toBe(true);

      component.submitProfile();
      expect(vendorsStub.update).not.toHaveBeenCalled();
    });

    it('renders a server-side 400 validation error inline through the saveError banner', async () => {
      vendorsStub.update.mockReturnValue(
        throwError(() => ({ error: { message: 'notificationEmail must be a valid email address' } })),
      );

      component.profileForm.patchValue({ notificationEmail: 'bad@bad' });
      // Client-side Validators.email may also flag this; force the save path regardless to
      // assert the server-error rendering contract independently of client validation.
      component.profileForm.get('notificationEmail')?.setErrors(null);
      component.submitProfile();
      await fixture.whenStable();

      expect(component.saveError()).toBe('notificationEmail must be a valid email address');
      fixture.detectChanges();
      const errorBanner = fixture.nativeElement.querySelector('.details-form .error-banner');
      expect(errorBanner?.textContent).toContain('notificationEmail must be a valid email address');
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

    it('clicking a preset chip prefills (does not force) the title field', () => {
      fixture.detectChanges();
      const presetChip: HTMLButtonElement = fixture.nativeElement.querySelector('.preset-chip');
      presetChip.click();
      expect(component.newSectionTitle()).toBe(presetChip.textContent?.trim());

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

    it('truncates an inline rename at 120 chars, mirroring the server DTO cap', () => {
      component.newSectionTitle.set('Original');
      component.addSection();
      const id = component.sections()[0].id;

      component.renameSection(id, { target: { value: 'x'.repeat(150) } } as unknown as Event);

      expect(component.sections()[0].title.length).toBe(120);
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

      component.moveProductInSection(id, 'product-2', -1);
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

    // ── Round-trips: UI actions -> saved payload ─────────────────────────

    it('saves a curated section\'s productIds in the order left by reorder actions, not add order', () => {
      component.newSectionTitle.set('Top Picks');
      component.newSectionType.set(VendorSectionType.CURATED);
      component.addSection();
      const id = component.sections()[0].id;

      component.addProductToSection(id, 'product-1');
      component.addProductToSection(id, 'product-2');
      component.moveProductInSection(id, 'product-2', -1); // product-2 should now lead

      vendorsStub.update.mockReturnValue(of(MOCK_VENDOR));
      component.saveSections();

      const [, payload] = vendorsStub.update.mock.calls[0] as [string, { profileSections: VendorProfileSection[] }];
      expect(payload.profileSections[0].productIds).toEqual(['product-2', 'product-1']);
    });

    it('saves a renamed section title, not the title it had when added', () => {
      component.newSectionTitle.set('Original Title');
      component.addSection();
      const id = component.sections()[0].id;
      component.addProductToSection(id, 'product-1'); // keep the section valid-for-save (curated needs >=1 product)

      component.renameSection(id, { target: { value: 'Renamed Title' } } as unknown as Event);

      vendorsStub.update.mockReturnValue(of(MOCK_VENDOR));
      component.saveSections();

      const [, payload] = vendorsStub.update.mock.calls[0] as [string, { profileSections: VendorProfileSection[] }];
      expect(payload.profileSections[0].title).toBe('Renamed Title');
    });

    it('saves a category section with type/categoryId and no productIds', () => {
      component.newSectionTitle.set('Gadgets Zone');
      component.newSectionType.set(VendorSectionType.CATEGORY);
      component.addSection();
      const id = component.sections()[0].id;
      component.setSectionCategory(id, 'cat-2');

      vendorsStub.update.mockReturnValue(of(MOCK_VENDOR));
      component.saveSections();

      const [, payload] = vendorsStub.update.mock.calls[0] as [string, { profileSections: VendorProfileSection[] }];
      expect(payload.profileSections[0]).toMatchObject({
        title: 'Gadgets Zone',
        type: VendorSectionType.CATEGORY,
        categoryId: 'cat-2',
      });
      expect(payload.profileSections[0].productIds).toBeUndefined();
    });

    // ── Client-side caps ───────────────────────────────────────────────────

    it('canAddSection() goes false at the MAX_SECTIONS cap and addSection() no-ops past it', () => {
      for (let i = 0; i < 10; i++) {
        component.newSectionTitle.set(`Section ${i}`);
        component.addSection();
      }
      expect(component.sections().length).toBe(10);
      expect(component.canAddSection()).toBe(false);

      component.newSectionTitle.set('Eleventh');
      component.addSection();

      expect(component.sections().length).toBe(10);
    });

    it('disables the Add section button in the DOM once the section cap is reached', () => {
      for (let i = 0; i < 10; i++) {
        component.newSectionTitle.set(`Section ${i}`);
        component.addSection();
      }
      component.newSectionTitle.set('Would be eleventh');
      fixture.detectChanges();

      const addBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.add-section-actions .secondary-btn');
      expect(addBtn.disabled).toBe(true);
    });

    it('addProductToSection() no-ops once a curated section hits CURATED_PRODUCTS_MAX', () => {
      component.newSectionTitle.set('Big Section');
      component.newSectionType.set(VendorSectionType.CURATED);
      component.addSection();
      const id = component.sections()[0].id;

      for (let i = 0; i < 24; i++) {
        component.addProductToSection(id, `product-${i}`);
      }
      expect(component.sections()[0].productIds?.length).toBe(24);

      component.addProductToSection(id, 'product-overflow');

      expect(component.sections()[0].productIds?.length).toBe(24);
      expect(component.sections()[0].productIds).not.toContain('product-overflow');
    });

    // ── Save-payload validity guard (structural: server 400s the WHOLE save otherwise) ──

    describe('sectionsValidForSave / invalid-section guard', () => {
      it('blocks save when a curated section has no productIds, and re-enables once one is added', () => {
        component.newSectionTitle.set('Empty Curated');
        component.newSectionType.set(VendorSectionType.CURATED);
        component.addSection();
        const id = component.sections()[0].id;

        expect(component.sectionsValidForSave()).toBe(false);
        expect(component.sectionValidationErrors().get(id)).toBe('Add at least one product.');

        vendorsStub.update.mockReturnValue(of(MOCK_VENDOR));
        component.saveSections();
        expect(vendorsStub.update).not.toHaveBeenCalled();

        component.addProductToSection(id, 'product-1');
        expect(component.sectionsValidForSave()).toBe(true);
        expect(component.sectionValidationErrors().has(id)).toBe(false);

        component.saveSections();
        expect(vendorsStub.update).toHaveBeenCalledTimes(1);
      });

      it('blocks save when a category section has no categoryId, and re-enables once one is chosen', () => {
        component.newSectionTitle.set('Empty Category');
        component.newSectionType.set(VendorSectionType.CATEGORY);
        component.addSection();
        const id = component.sections()[0].id;

        expect(component.sectionsValidForSave()).toBe(false);
        expect(component.sectionValidationErrors().get(id)).toBe('Choose a category.');

        vendorsStub.update.mockReturnValue(of(MOCK_VENDOR));
        component.saveSections();
        expect(vendorsStub.update).not.toHaveBeenCalled();

        component.setSectionCategory(id, 'cat-1');
        expect(component.sectionsValidForSave()).toBe(true);

        component.saveSections();
        expect(vendorsStub.update).toHaveBeenCalledTimes(1);
      });

      it('blocks save when a section title is blank/whitespace-only', () => {
        component.sections.set([
          { id: 'sec-blank', title: '   ', type: VendorSectionType.CURATED, productIds: ['product-1'] },
        ]);

        expect(component.sectionsValidForSave()).toBe(false);
        expect(component.sectionValidationErrors().get('sec-blank')).toBe('Add a title.');

        vendorsStub.update.mockReturnValue(of(MOCK_VENDOR));
        component.saveSections();
        expect(vendorsStub.update).not.toHaveBeenCalled();
      });

      it('disables the Save sections button in the DOM while invalid, and re-enables it once fixed', () => {
        component.newSectionTitle.set('Empty Curated');
        component.newSectionType.set(VendorSectionType.CURATED);
        component.addSection();
        const id = component.sections()[0].id;
        fixture.detectChanges();

        const saveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.panel--full .primary-btn');
        expect(saveBtn.disabled).toBe(true);

        component.addProductToSection(id, 'product-1');
        fixture.detectChanges();
        expect(saveBtn.disabled).toBe(false);
      });
    });

    // ── Reorder desync guard (id-based, not filtered-index-based) ─────────

    it('reorders correctly by productId even when a section holds an id unresolvable to a fetched product', () => {
      // 'ghost-product' never appears in MOCK_PRODUCTS — sectionProducts() silently drops it,
      // which is exactly the scenario that desyncs a filtered-list index from the raw array.
      const section: VendorProfileSection = {
        id: 'sec-1',
        title: 'Top Picks',
        type: VendorSectionType.CURATED,
        productIds: ['ghost-product', 'product-1', 'product-2'],
      };
      component.sections.set([section]);

      // Move product-2 up by its own id — should swap with product-1, leaving the
      // unresolvable ghost id untouched at index 0.
      component.moveProductInSection('sec-1', 'product-2', -1);

      expect(component.sections()[0].productIds).toEqual(['ghost-product', 'product-2', 'product-1']);

      vendorsStub.update.mockReturnValue(of(MOCK_VENDOR));
      component.saveSections();

      const [, payload] = vendorsStub.update.mock.calls[0] as [string, { profileSections: VendorProfileSection[] }];
      expect(payload.profileSections[0].productIds).toEqual(['ghost-product', 'product-2', 'product-1']);
    });

    // ── Truncated product list warning ─────────────────────────────────────

    it('surfaces a warning when the vendor has more products than the single fetched page', async () => {
      const truncatedPage: PagedResponse<ProductDto> = { items: MOCK_PRODUCTS, total: 150, page: 1, limit: 100 };
      productsStub.list.mockReturnValue(of(truncatedPage));
      TestBed.resetTestingModule();
      await setupTestBed(vendorsStub, productsStub);
      const truncatedFixture = TestBed.createComponent(VendorProfile);
      truncatedFixture.detectChanges();
      await truncatedFixture.whenStable();

      expect(truncatedFixture.componentInstance.vendorProductsTruncated()).toBe(true);
    });

    it('does not show the truncation warning when all products fit on one page', () => {
      expect(component.vendorProductsTruncated()).toBe(false);
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
