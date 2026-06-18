import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VendorStatus, AdminVendorDto } from '@hb/shared';

import { vendorActionsFor } from './vendor-transitions';
import { AdminVendors } from './admin-vendors';
import { VendorsService } from '../../../../core/api/vendors.service';

// ─── Pure function unit tests ────────────────────────────────────────────────

describe('vendorActionsFor', () => {
  it('pending → [approve, reject] with correct targets', () => {
    const actions = vendorActionsFor(VendorStatus.PENDING);
    expect(actions.length).toBe(2);

    const targets = actions.map(a => a.target);
    expect(targets).toContain(VendorStatus.APPROVED);
    expect(targets).toContain(VendorStatus.REJECTED);
  });

  it('approved → [suspend] with target=suspended', () => {
    const actions = vendorActionsFor(VendorStatus.APPROVED);
    expect(actions.length).toBe(1);
    expect(actions[0].target).toBe(VendorStatus.SUSPENDED);
    expect(actions[0].label).toBe('Suspend');
  });

  it('suspended → [re-approve] with target=approved', () => {
    const actions = vendorActionsFor(VendorStatus.SUSPENDED);
    expect(actions.length).toBe(1);
    expect(actions[0].target).toBe(VendorStatus.APPROVED);
  });

  it('rejected → [] (no actions)', () => {
    const actions = vendorActionsFor(VendorStatus.REJECTED);
    expect(actions.length).toBe(0);
  });

  it('no action ever targets "pending"', () => {
    const allStatuses: VendorStatus[] = [
      VendorStatus.PENDING,
      VendorStatus.APPROVED,
      VendorStatus.REJECTED,
      VendorStatus.SUSPENDED,
    ];
    for (const status of allStatuses) {
      const targets = vendorActionsFor(status).map(a => a.target);
      expect(targets).not.toContain(VendorStatus.PENDING);
    }
  });

  it('pending approve action has label "Approve"', () => {
    const actions = vendorActionsFor(VendorStatus.PENDING);
    const approve = actions.find(a => a.target === VendorStatus.APPROVED);
    expect(approve).toBeDefined();
    expect(approve!.label).toBe('Approve');
  });

  it('pending reject action has label "Reject"', () => {
    const actions = vendorActionsFor(VendorStatus.PENDING);
    const reject = actions.find(a => a.target === VendorStatus.REJECTED);
    expect(reject).toBeDefined();
    expect(reject!.label).toBe('Reject');
  });

  it('suspended re-approve action has label "Re-approve"', () => {
    const actions = vendorActionsFor(VendorStatus.SUSPENDED);
    expect(actions[0].label).toBe('Re-approve');
  });
});

// ─── Component integration tests ─────────────────────────────────────────────

const MOCK_VENDORS: AdminVendorDto[] = [
  {
    id: 'v1',
    businessName: 'Acme Corp',
    tradingName: 'Acme',
    status: VendorStatus.PENDING,
    countryCode: 'ZA',
    appliedAt: '2026-06-01T10:00:00.000Z',
    registrationNumber: '2024/123456/07',
    website: 'https://acme.example.com',
    description: 'A vendor description',
    verificationDocumentUrl: 'https://docs.example.com/verify.pdf',
  },
  {
    id: 'v2',
    businessName: 'Beta Supplies',
    status: VendorStatus.APPROVED,
    countryCode: 'NA',
    appliedAt: '2026-05-15T08:30:00.000Z',
  },
  {
    id: 'v3',
    businessName: 'Gamma Trade',
    status: VendorStatus.REJECTED,
    countryCode: 'ZA',
    appliedAt: '2026-04-20T14:00:00.000Z',
  },
  {
    id: 'v4',
    businessName: 'Delta Market',
    status: VendorStatus.SUSPENDED,
    countryCode: 'ZA',
    appliedAt: '2026-03-10T09:00:00.000Z',
  },
];

interface VendorsServiceStub {
  list: ReturnType<typeof vi.fn>;
  updateStatus: ReturnType<typeof vi.fn>;
}

describe('AdminVendors component', () => {
  let component: AdminVendors;
  let fixture: ComponentFixture<AdminVendors>;
  let vendorsStub: VendorsServiceStub;

  beforeEach(async () => {
    vendorsStub = {
      list: vi.fn(() => of([...MOCK_VENDORS])),
      updateStatus: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminVendors],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VendorsService, useValue: vendorsStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminVendors);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads vendors on init and clears loading flag', () => {
    expect(vendorsStub.list).toHaveBeenCalledTimes(1);
    expect(component.loading()).toBe(false);
    expect(component.vendors().length).toBe(4);
  });

  it('shows all vendors when filter is "all"', () => {
    expect(component.activeFilter()).toBe('all');
    expect(component.filteredVendors().length).toBe(4);
  });

  it('filters to pending vendors', () => {
    component.setFilter(VendorStatus.PENDING);
    expect(component.filteredVendors().length).toBe(1);
    expect(component.filteredVendors()[0].id).toBe('v1');
  });

  it('filters to approved vendors', () => {
    component.setFilter(VendorStatus.APPROVED);
    expect(component.filteredVendors().length).toBe(1);
    expect(component.filteredVendors()[0].id).toBe('v2');
  });

  it('filters to rejected vendors', () => {
    component.setFilter(VendorStatus.REJECTED);
    expect(component.filteredVendors().length).toBe(1);
    expect(component.filteredVendors()[0].id).toBe('v3');
  });

  it('filters to suspended vendors', () => {
    component.setFilter(VendorStatus.SUSPENDED);
    expect(component.filteredVendors().length).toBe(1);
    expect(component.filteredVendors()[0].id).toBe('v4');
  });

  it('setFilter clears selectedId', () => {
    component.selectVendor('v1');
    expect(component.selectedId()).toBe('v1');
    component.setFilter(VendorStatus.APPROVED);
    expect(component.selectedId()).toBeNull();
  });

  it('selectVendor populates selectedVendor computed', () => {
    component.selectVendor('v2');
    expect(component.selectedVendor()?.businessName).toBe('Beta Supplies');
  });

  it('countFor returns correct counts', () => {
    expect(component.countFor('all')).toBe(4);
    expect(component.countFor(VendorStatus.PENDING)).toBe(1);
    expect(component.countFor(VendorStatus.APPROVED)).toBe(1);
    expect(component.countFor(VendorStatus.REJECTED)).toBe(1);
    expect(component.countFor(VendorStatus.SUSPENDED)).toBe(1);
  });

  it('applyAction calls updateStatus and updates vendor status in the local list', async () => {
    const updatedVendor: AdminVendorDto = {
      ...MOCK_VENDORS[0],
      status: VendorStatus.APPROVED,
    };
    vendorsStub.updateStatus.mockReturnValue(of(updatedVendor));

    component.applyAction('v1', VendorStatus.APPROVED);
    await fixture.whenStable();

    expect(vendorsStub.updateStatus).toHaveBeenCalledWith('v1', { status: VendorStatus.APPROVED });
    const v1 = component.vendors().find(v => v.id === 'v1');
    expect(v1?.status).toBe(VendorStatus.APPROVED);
    expect(component.pendingId()).toBeNull();
  });

  it('applyAction surfaces actionError on failure and clears pendingId', async () => {
    vendorsStub.updateStatus.mockReturnValue(throwError(() => new Error('Network error')));

    component.applyAction('v1', VendorStatus.REJECTED);
    await fixture.whenStable();

    expect(component.actionError()).toBeTruthy();
    expect(component.pendingId()).toBeNull();
  });
});

// ─── Error loading test (isolated setup) ─────────────────────────────────────

describe('AdminVendors — load error path', () => {
  it('sets error signal and clears loading when list() fails', async () => {
    const failStub: VendorsServiceStub = {
      list: vi.fn(() => throwError(() => new Error('500'))),
      updateStatus: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminVendors],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VendorsService, useValue: failStub },
      ],
    }).compileComponents();

    const failFixture = TestBed.createComponent(AdminVendors);
    const failComponent = failFixture.componentInstance;
    failFixture.detectChanges();
    await failFixture.whenStable();

    expect(failComponent.loading()).toBe(false);
    expect(failComponent.error()).toBeTruthy();
  });
});
