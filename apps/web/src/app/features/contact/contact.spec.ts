import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser, ContactInquiryDto, InquiryOrderType } from '@hb/shared';

import { Contact } from './contact';
import { AuthService } from '../../core/auth/auth.service';
import { ContactService } from '../../core/api/contact.service';
import { NotificationService } from '../../core/notifications/notification.service';

const ACK: ContactInquiryDto = { id: 'inquiry-1', receivedAt: '2026-08-16T09:00:00.000Z' };

describe('Contact', () => {
  let fixture: ComponentFixture<Contact>;
  let component: Contact;
  let contactService: { create: ReturnType<typeof vi.fn> };
  let notificationService: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const authStub = {
      isLoggedIn: vi.fn().mockReturnValue(false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
      logout: vi.fn(),
    };
    contactService = { create: vi.fn() };
    notificationService = { success: vi.fn(), error: vi.fn(), info: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Contact],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
        { provide: ContactService, useValue: contactService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Contact);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function fillValidForm(): void {
    component.contactForm.setValue({
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '',
      orderType: InquiryOrderType.ONE_TIME,
      hasReferenceNumber: false,
      referenceNumber: '',
      message: 'Please source this for me.',
    });
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the hero, form and WhatsApp headings', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Get in Touch');
    expect(el.textContent).toContain('Send us a Message');
    expect(el.textContent).toContain('Or Message Us on WhatsApp');
  });

  it('serves the hero as a responsive picture with a WebP source and a JPEG fallback', () => {
    const el: HTMLElement = fixture.nativeElement;
    const source = el.querySelector('.contact-hero__picture source') as HTMLSourceElement;
    const img = el.querySelector('.contact-hero__image') as HTMLImageElement;

    expect(source.type).toBe('image/webp');
    expect(source.srcset).toContain('.webp 640w');
    expect(img.getAttribute('srcset')).toContain('.jpg 640w');
    expect(img.getAttribute('sizes')).toBe('100vw');
  });

  it('marks the hero as the LCP element and reserves its box', () => {
    const img = (fixture.nativeElement as HTMLElement).querySelector(
      '.contact-hero__image',
    ) as HTMLImageElement;

    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
    expect(img.getAttribute('fetchpriority')).toBe('high');
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('width')).toBe('1168');
    expect(img.getAttribute('height')).toBe('784');
  });

  it('sets a real page title and meta description', () => {
    const title = TestBed.inject(Title);
    const meta = TestBed.inject(Meta);
    expect(title.getTitle()).toContain('Contact');
    expect(meta.getTag('name="description"')?.content).toContain('H&B');
  });

  it('states the response time as exactly "within 1 business day", never the old 24-48h claim', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('within 1 business day');
    expect(text).not.toContain('24–48 hours');
    expect(text).not.toContain('24-48 hours');
  });

  it('renders the WhatsApp CTA, phone and email from the contact-details constants', () => {
    const el: HTMLElement = fixture.nativeElement;
    const whatsapp = el.querySelector('.contact-whatsapp-btn') as HTMLAnchorElement;
    expect(whatsapp.getAttribute('href')).toContain('wa.me/264813559921');

    expect(el.textContent).toContain('+264 81 355 9921');
    expect(el.textContent).toContain('info@hb-ecommerce.com');
  });

  it('shows inline validation errors once fields are touched', () => {
    component.nameControl.markAsTouched();
    component.emailControl.setValue('not-an-email');
    component.emailControl.markAsTouched();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Name is required.');
    expect(text).toContain('Please enter a valid email address.');
  });

  // The API caps every string field (CreateContactInquiryDto @MaxLength, mirrored
  // by the contact_inquiries column widths). If the client didn't cap them too,
  // the server's 400 would surface as the generic "something went wrong" toast
  // with no indication of which field to shorten.
  it('caps every field at the same length the API DTO enforces', () => {
    const el: HTMLElement = fixture.nativeElement;
    component.contactForm.controls.hasReferenceNumber.setValue(true);
    component.onReferenceNumberToggle();
    fixture.detectChanges();

    expect(el.querySelector('#contact-name')?.getAttribute('maxlength')).toBe('200');
    expect(el.querySelector('#contact-email')?.getAttribute('maxlength')).toBe('255');
    expect(el.querySelector('#contact-phone')?.getAttribute('maxlength')).toBe('50');
    expect(el.querySelector('#contact-reference-number')?.getAttribute('maxlength')).toBe('100');
    expect(el.querySelector('#contact-message')?.getAttribute('maxlength')).toBe('5000');
  });

  it('rejects an over-long message client-side rather than letting the API 400 it', () => {
    fillValidForm();
    component.messageControl.setValue('x'.repeat(5001));
    component.messageControl.markAsTouched();
    fixture.detectChanges();

    expect(component.messageControl.hasError('maxlength')).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Message must be 5000 characters or fewer.',
    );

    component.submit();
    expect(contactService.create).not.toHaveBeenCalled();
  });

  it('does not submit and marks fields touched when the form is invalid', () => {
    component.submit();
    expect(contactService.create).not.toHaveBeenCalled();
    expect(component.nameControl.touched).toBe(true);
  });

  it('reveals the reference-number field only once ticked, and clears it when unticked', () => {
    fillValidForm();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#contact-reference-number')).toBeNull();

    const checkbox = fixture.nativeElement.querySelector(
      '.contact-checkbox input',
    ) as HTMLInputElement;

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#contact-reference-number')).not.toBeNull();

    component.contactForm.controls.referenceNumber.setValue('REF-123');

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.contactForm.controls.referenceNumber.value).toBe('');
    expect(fixture.nativeElement.querySelector('#contact-reference-number')).toBeNull();
  });

  it('submits the enum VALUE for orderType (not the display label) and omits empty optional fields', () => {
    contactService.create.mockReturnValue(of(ACK));
    fillValidForm();

    component.submit();

    expect(contactService.create).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: 'jane@example.com',
      orderType: InquiryOrderType.ONE_TIME,
      message: 'Please source this for me.',
    });
  });

  it('includes phone and referenceNumber only when supplied', () => {
    contactService.create.mockReturnValue(of(ACK));
    fillValidForm();
    component.contactForm.patchValue({
      phone: '+264811234567',
      hasReferenceNumber: true,
      referenceNumber: 'REF-1',
    });

    component.submit();

    expect(contactService.create).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+264811234567', referenceNumber: 'REF-1' }),
    );
  });

  it('on success, shows a success notification and resets the form', () => {
    contactService.create.mockReturnValue(of(ACK));
    fillValidForm();

    component.submit();

    expect(notificationService.success).toHaveBeenCalledTimes(1);
    expect(notificationService.success.mock.calls[0][0]).toContain('within 1 business day');
    expect(component.contactForm.controls.name.value).toBe('');
    expect(component.contactForm.controls.message.value).toBe('');
  });

  it('on failure, shows an error notification and keeps the user\'s input', () => {
    contactService.create.mockReturnValue(throwError(() => new Error('network error')));
    fillValidForm();

    component.submit();

    expect(notificationService.error).toHaveBeenCalledTimes(1);
    expect(component.contactForm.controls.name.value).toBe('Jane Doe');
    expect(component.contactForm.controls.message.value).toBe('Please source this for me.');
  });

  it('disables the submit button while a submission is in flight and re-enables after', () => {
    const subject = new Subject<ContactInquiryDto>();
    contactService.create.mockReturnValue(subject.asObservable());
    fillValidForm();

    component.submit();
    fixture.detectChanges();

    expect(component.isSubmitting()).toBe(true);
    const button = fixture.nativeElement.querySelector('.contact-submit-btn') as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    subject.next(ACK);
    subject.complete();
    fixture.detectChanges();

    expect(component.isSubmitting()).toBe(false);
    expect(button.disabled).toBe(false);
  });

  it('does not double-submit while a submission is already in flight', () => {
    const subject = new Subject<ContactInquiryDto>();
    contactService.create.mockReturnValue(subject.asObservable());
    fillValidForm();

    component.submit();
    component.submit();

    expect(contactService.create).toHaveBeenCalledTimes(1);
  });
});
