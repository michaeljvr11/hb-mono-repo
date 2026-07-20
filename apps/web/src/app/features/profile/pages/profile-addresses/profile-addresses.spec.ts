import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AddressDto, CountryCode } from '@hb/shared';

import { ProfileAddresses } from './profile-addresses';
import { AddressesService } from '../../../../core/api/addresses.service';

interface AddressesServiceStub {
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

const ADDRESS_1: AddressDto = {
  id: 'addr-1',
  recipientName: 'Jane Doe',
  line1: '12 Long Street',
  city: 'Cape Town',
  region: 'Western Cape',
  postalCode: '8001',
  countryCode: CountryCode.SOUTH_AFRICA,
  phone: '0821234567',
};

const ADDRESS_2: AddressDto = {
  id: 'addr-2',
  recipientName: 'Jane Doe',
  line1: '5 Independence Ave',
  city: 'Windhoek',
  countryCode: CountryCode.NAMIBIA,
};

function makeAddressesStub(initial: AddressDto[] = [ADDRESS_1, ADDRESS_2]): AddressesServiceStub {
  return {
    list: vi.fn(() => of(initial)),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

async function createFixture(
  addressesStub: AddressesServiceStub,
): Promise<ComponentFixture<ProfileAddresses>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [ProfileAddresses],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      { provide: AddressesService, useValue: addressesStub },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ProfileAddresses);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('ProfileAddresses', () => {
  let fixture: ComponentFixture<ProfileAddresses>;
  let component: ProfileAddresses;
  let addressesStub: AddressesServiceStub;

  beforeEach(async () => {
    addressesStub = makeAddressesStub();
    fixture = await createFixture(addressesStub);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── List ──────────────────────────────────────────────────────────────

  it('loads and renders the address list', () => {
    expect(addressesStub.list).toHaveBeenCalledTimes(1);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('12 Long Street');
    expect(el.textContent).toContain('5 Independence Ave');
  });

  it('shows an empty state when there are no addresses', async () => {
    const emptyStub = makeAddressesStub([]);
    const emptyFixture = await createFixture(emptyStub);
    const el: HTMLElement = emptyFixture.nativeElement;
    expect(el.textContent).toContain("You haven't added any addresses yet.");
  });

  // ── Add ───────────────────────────────────────────────────────────────

  it('adds an address and refreshes the list from the response', () => {
    const created: AddressDto = {
      id: 'addr-3',
      recipientName: 'New Person',
      line1: '1 New Street',
      city: 'Windhoek',
      countryCode: CountryCode.NAMIBIA,
    };
    addressesStub.create.mockReturnValue(of(created));

    component.openAddForm();
    component.form.setValue({
      recipientName: 'New Person',
      line1: '1 New Street',
      line2: '',
      city: 'Windhoek',
      region: '',
      postalCode: '',
      countryCode: CountryCode.NAMIBIA,
      phone: '',
    });
    component.submitForm();

    expect(addressesStub.create).toHaveBeenCalledWith({
      recipientName: 'New Person',
      line1: '1 New Street',
      line2: undefined,
      city: 'Windhoek',
      region: undefined,
      postalCode: undefined,
      countryCode: CountryCode.NAMIBIA,
      phone: undefined,
    });
    expect(component.addresses()).toContainEqual(created);
    expect(component.formOpen()).toBe(false);
  });

  // ── Edit ──────────────────────────────────────────────────────────────

  it('edits an address and replaces it in the list', () => {
    const updated: AddressDto = { ...ADDRESS_1, city: 'Stellenbosch' };
    addressesStub.update.mockReturnValue(of(updated));

    component.openEditForm(ADDRESS_1);
    component.form.patchValue({ city: 'Stellenbosch' });
    component.submitForm();

    expect(addressesStub.update).toHaveBeenCalledWith(
      'addr-1',
      expect.objectContaining({ city: 'Stellenbosch' }),
    );
    expect(component.addresses().find((a) => a.id === 'addr-1')).toEqual(updated);
  });

  // ── Delete ────────────────────────────────────────────────────────────

  it('deletes an address on confirm', () => {
    addressesStub.delete.mockReturnValue(of(undefined));

    component.confirmDelete('addr-1');
    expect(component.pendingDeleteId()).toBe('addr-1');

    component.deleteAddress('addr-1');

    expect(addressesStub.delete).toHaveBeenCalledWith('addr-1');
    expect(component.addresses().find((a) => a.id === 'addr-1')).toBeUndefined();
    expect(component.pendingDeleteId()).toBeNull();
  });

  it('shows an inline error banner when delete fails', () => {
    addressesStub.delete.mockReturnValue(
      throwError(() => ({ error: { message: 'Cannot delete address in use.' } })),
    );

    component.confirmDelete('addr-1');
    component.deleteAddress('addr-1');
    fixture.detectChanges();

    expect(component.deleteError()).toBe('Cannot delete address in use.');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Cannot delete address in use.');
    // Address remains in the list since the delete failed.
    expect(component.addresses().find((a) => a.id === 'addr-1')).toBeTruthy();
  });

  it('falls back to a default message when the delete error has no server message', () => {
    addressesStub.delete.mockReturnValue(throwError(() => ({ error: {} })));

    component.confirmDelete('addr-1');
    component.deleteAddress('addr-1');

    expect(component.deleteError()).toBe('Failed to delete address. Please try again.');
  });
});
