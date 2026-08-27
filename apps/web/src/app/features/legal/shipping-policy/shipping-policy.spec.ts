import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser } from '@hb/shared';

import { ShippingPolicy } from './shipping-policy';
import { AuthService } from '../../../core/auth/auth.service';

describe('ShippingPolicy', () => {
  let fixture: ComponentFixture<ShippingPolicy>;
  let component: ShippingPolicy;

  beforeEach(async () => {
    const authStub = {
      isLoggedIn: vi.fn().mockReturnValue(false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ShippingPolicy],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShippingPolicy);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the key section headings', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Shipping Policy');
    expect(el.textContent).toContain('Where we deliver');
    expect(el.textContent).toContain('Shipping fee');
    expect(el.textContent).toContain('How long delivery takes');
    expect(el.textContent).toContain('Cross-border handling');
    expect(el.textContent).toContain('Risk in transit');
    expect(el.textContent).toContain('Vendor-fulfilled orders');
  });

  it('sets a real page title and meta description', () => {
    const title = TestBed.inject(Title);
    const meta = TestBed.inject(Meta);
    expect(title.getTitle()).toContain('Shipping Policy');
    expect(meta.getTag('name="description"')?.content).toContain('H&B');
  });

  it('states the confirmed delivery timeframe rather than a placeholder', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('14');
    expect(el.textContent).toContain('28');
    expect(el.textContent).not.toContain('[DELIVERY TIMEFRAME]');
  });

  it('renders the still-unresolved shipping fee amount as a visible placeholder token', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('[SHIPPING FEE AMOUNT]');
    expect(el.querySelectorAll('.legal-placeholder').length).toBe(1);
  });

  it('never claims free shipping', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent?.toLowerCase()).not.toContain('free shipping');
  });

  it('states the MAX-across-lines shipping fee rule, not a per-item sum', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('one shipping fee');
    expect(el.textContent).toContain('highest fee');
    expect(el.textContent).toContain('never the sum');
  });

  it('links to the Returns policy and Terms of Service', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a[href="/legal/returns"]')).toBeTruthy();
    expect(el.querySelector('a[href="/legal/terms"]')).toBeTruthy();
  });
});
