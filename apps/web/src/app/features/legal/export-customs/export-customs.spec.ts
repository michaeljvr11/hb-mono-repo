import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser } from '@hb/shared';

import { ExportCustoms } from './export-customs';
import { AuthService } from '../../../core/auth/auth.service';

describe('ExportCustoms', () => {
  let fixture: ComponentFixture<ExportCustoms>;
  let component: ExportCustoms;

  beforeEach(async () => {
    const authStub = {
      isLoggedIn: vi.fn().mockReturnValue(false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ExportCustoms],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExportCustoms);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the key section headings', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Export & Customs Terms');
    expect(el.textContent).toContain('What this means for the price you pay');
    expect(el.textContent).toContain('Who is the exporter and importer of record');
    expect(el.textContent).toContain('Restricted and prohibited goods');
    expect(el.textContent).toContain('Which courier carries your order');
  });

  it('sets a real page title and meta description', () => {
    const title = TestBed.inject(Title);
    const meta = TestBed.inject(Meta);
    expect(title.getTitle()).toContain('Export & Customs Terms');
    expect(meta.getTag('name="description"')?.content).toContain('SACU');
  });

  // The one thing this page must not do (card LC-6 AC 2): flatten the SACU
  // position into a blanket "no duty" claim that is false for Procurement
  // Service items sourced outside South Africa.
  it('states the SACU and non-SACU-sourced cases as two distinct outcomes', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('South African origin');
    expect(text).toContain('without import duty');
    expect(text).toContain('outside South Africa');
    expect(text).toContain('may attract Namibian import duty and VAT');
  });

  it('never blanket-states that orders cross the border duty-free', () => {
    const text = (fixture.nativeElement.textContent as string).toLowerCase();
    expect(text).not.toContain('duty-free for all');
    expect(text).not.toContain('no duty is payable');
    expect(text).not.toMatch(/all orders? (cross|ship).{0,40}duty[- ]free/);
  });

  // Verified against the code at ship time: orders carry subtotal +
  // shippingTotal + total and no duty/tax line exists anywhere in pricing.
  it('is honest that duty is not calculated or collected at checkout', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('does not include');
    expect(text).toContain('any import duty or VAT');
  });

  it('renders the unresolved facts as visible placeholder tokens, not invented answers', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('[EXPORTER OF RECORD]');
    expect(el.textContent).toContain('[IMPORTER OF RECORD]');
    expect(el.textContent).toContain('[PROHIBITED GOODS LIST]');
    expect(el.textContent).toContain('[COURIER]');
    expect(el.querySelectorAll('.legal-placeholder').length).toBe(4);
  });

  // Card LC-6 AC 3 — no invented courier name, and no invented prohibited-goods list.
  it('names no courier and lists no prohibited goods', () => {
    const text = (fixture.nativeElement.textContent as string).toLowerCase();
    for (const courier of ['dhl', 'fedex', 'ups', 'aramex', 'postnet', 'the courier guy']) {
      expect(text).not.toContain(courier);
    }
  });

  // The vault template claimed the customsReference rule is "already enforced"
  // in the data model. It is not — there is no shipping service, and the column
  // is nullable — so the page must not claim a customer-visible guarantee.
  it('does not claim customs status is visible to the customer today', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('None of this is visible');
    expect(text).toContain('there is no customs-status or shipment-tracking');
  });

  it('links to the Shipping, Returns and Terms pages', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a[href="/legal/shipping"]')).toBeTruthy();
    expect(el.querySelector('a[href="/legal/returns"]')).toBeTruthy();
    expect(el.querySelector('a[href="/legal/terms"]')).toBeTruthy();
  });

  it('binds support contact details to the shared constant', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a[href="mailto:info@hb-ecommerce.com"]')).toBeTruthy();
    expect(el.textContent).toContain('+264 81 355 9921');
  });
});
