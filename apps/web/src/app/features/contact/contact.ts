import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { finalize } from 'rxjs';
import { CreateContactInquiryRequest, InquiryOrderType } from '@hb/shared';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { ContactService } from '../../core/api/contact.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { CONTACT_DETAILS } from '../../shared/constants/site.constants';
import { HERO_SIZES, SITE_IMAGES } from '../../shared/constants/image.constants';

/**
 * LSM-4 — the "source me something not listed on the site" channel (see
 * [[Landing Site Migration]]). Matches the Title/Meta + marketing-hero
 * pattern established by /about (LSM-2) and /services (LSM-3).
 *
 * Response time is deliberately "within 1 business day" everywhere on this
 * page — hb-landing's "within 24–48 hours" contradicts 15-customer-support.md
 * and must not be ported.
 */
const PAGE_TITLE = 'Contact H&B — Get a Quote or Request an Import';
const PAGE_DESCRIPTION =
  "Message H&B or chat on WhatsApp for a quote on anything not listed on the marketplace — we reply within 1 business day.";

interface OrderTypeOption {
  value: InquiryOrderType;
  label: string;
}

/** Labels carried across from hb-landing's `orderTypeOptions`; values narrowed
 * to the shared `InquiryOrderType` enum instead of hb-landing's free strings. */
const ORDER_TYPE_OPTIONS: OrderTypeOption[] = [
  { value: InquiryOrderType.RECURRING, label: 'Recurring / business bulk order' },
  { value: InquiryOrderType.ONE_TIME, label: 'One-time order' },
  { value: InquiryOrderType.OTHER, label: 'Other (please explain below)' },
];

@Component({
  selector: 'app-contact',
  imports: [NavBar, Footer, ReactiveFormsModule],
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
})
export class Contact {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly formBuilder = inject(FormBuilder);
  private readonly contactService = inject(ContactService);
  private readonly notificationService = inject(NotificationService);

  readonly heroImage = SITE_IMAGES.contactHero;
  readonly heroSizes = HERO_SIZES;
  readonly contactDetails = CONTACT_DETAILS;
  readonly orderTypeOptions = ORDER_TYPE_OPTIONS;

  /** Signal-backed so the submit button can be disabled while in flight —
   * a double-click cannot double-post. */
  readonly isSubmitting = signal(false);

  /** Mirrors `contactForm.controls.hasReferenceNumber.value` for the template.
   * Reading the FormControl's mutable `.value` directly inside an `@if` trips
   * `NG0100` (ExpressionChangedAfterItHasBeenCheckedError) — a signal gives
   * change detection a stable value to re-check per pass. */
  readonly showReferenceNumber = signal(false);

  /**
   * Length caps mirror `CreateContactInquiryDto`'s `@MaxLength` values (and
   * therefore the `contact_inquiries` column widths) exactly. Without them the
   * server is the first thing to reject an over-long message, and its 400
   * surfaces here as the generic failure toast — the user is told "something
   * went wrong" with no idea which field to shorten.
   */
  static readonly MAX_LENGTHS = {
    name: 200,
    email: 255,
    phone: 50,
    referenceNumber: 100,
    message: 5000,
  } as const;

  readonly maxLengths = Contact.MAX_LENGTHS;

  readonly contactForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(Contact.MAX_LENGTHS.name)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(Contact.MAX_LENGTHS.email)]],
    phone: ['', [Validators.maxLength(Contact.MAX_LENGTHS.phone)]],
    orderType: ['' as InquiryOrderType | '', [Validators.required]],
    hasReferenceNumber: [false],
    referenceNumber: ['', [Validators.maxLength(Contact.MAX_LENGTHS.referenceNumber)]],
    message: ['', [Validators.required, Validators.maxLength(Contact.MAX_LENGTHS.message)]],
  });

  get nameControl() {
    return this.contactForm.controls.name;
  }

  get emailControl() {
    return this.contactForm.controls.email;
  }

  get orderTypeControl() {
    return this.contactForm.controls.orderType;
  }

  get messageControl() {
    return this.contactForm.controls.message;
  }

  constructor() {
    this.titleService.setTitle(PAGE_TITLE);
    this.meta.updateTag({ name: 'description', content: PAGE_DESCRIPTION });
  }

  /** Mirrors hb-landing's interaction: unticking the checkbox clears whatever
   * was typed, so a stale reference number can never be submitted silently
   * hidden behind a collapsed field. */
  onReferenceNumberToggle(): void {
    const checked = this.contactForm.controls.hasReferenceNumber.value;
    this.showReferenceNumber.set(checked);
    if (!checked) {
      this.contactForm.controls.referenceNumber.reset('');
    }
  }

  submit(): void {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }
    if (this.isSubmitting()) {
      return;
    }

    const raw = this.contactForm.getRawValue();
    const payload: CreateContactInquiryRequest = {
      name: raw.name,
      email: raw.email,
      orderType: raw.orderType as InquiryOrderType,
      message: raw.message,
      ...(raw.phone ? { phone: raw.phone } : {}),
      ...(raw.hasReferenceNumber && raw.referenceNumber
        ? { referenceNumber: raw.referenceNumber }
        : {}),
    };

    this.isSubmitting.set(true);

    this.contactService
      .create(payload)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.notificationService.success(
            "Thanks — we've received your message and will get back to you within 1 business day.",
          );
          this.contactForm.reset({
            name: '',
            email: '',
            phone: '',
            orderType: '',
            hasReferenceNumber: false,
            referenceNumber: '',
            message: '',
          });
          this.showReferenceNumber.set(false);
        },
        // Failure path keeps the user's input (no reset) and points them at
        // the WhatsApp/email fallbacks rather than asking them to retype.
        error: () => {
          this.notificationService.error(
            `Sorry, something went wrong sending your message. Please try again, or reach us on WhatsApp or at ${this.contactDetails.email}.`,
          );
        },
      });
  }
}
