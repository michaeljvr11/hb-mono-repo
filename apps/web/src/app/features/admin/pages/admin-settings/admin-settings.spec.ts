import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlatformSettingsDto } from '@hb/shared';

import { AdminSettings } from './admin-settings';
import { SettingsService } from '../../../../core/api/settings.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_SETTINGS: PlatformSettingsDto = {
  notificationEmails: ['ops@hb.co.za', 'finance@hb.co.za'],
};

// ─── Stub shape ──────────────────────────────────────────────────────────────

interface SettingsServiceStub {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

// ─── Component integration tests ─────────────────────────────────────────────

describe('AdminSettings component', () => {
  let component: AdminSettings;
  let fixture: ComponentFixture<AdminSettings>;
  let stub: SettingsServiceStub;

  beforeEach(async () => {
    stub = {
      get: vi.fn(() => of({ notificationEmails: [...MOCK_SETTINGS.notificationEmails] })),
      update: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminSettings],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SettingsService, useValue: stub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminSettings);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads and renders the current list on init', () => {
    expect(stub.get).toHaveBeenCalledTimes(1);
    expect(component.loading()).toBe(false);
    expect(component.emails()).toEqual(['ops@hb.co.za', 'finance@hb.co.za']);
  });

  it('adds a valid new address to the local list', () => {
    component.newEmail.set('new@hb.co.za');
    component.addEmail();

    expect(component.emails()).toEqual(['ops@hb.co.za', 'finance@hb.co.za', 'new@hb.co.za']);
    expect(component.newEmail()).toBe('');
    expect(component.addError()).toBeNull();
  });

  it('rejects an address with an invalid shape', () => {
    component.newEmail.set('not-an-email');
    component.addEmail();

    expect(component.emails()).toEqual(['ops@hb.co.za', 'finance@hb.co.za']);
    expect(component.addError()).toBeTruthy();
  });

  it('rejects a duplicate address', () => {
    component.newEmail.set('ops@hb.co.za');
    component.addEmail();

    expect(component.emails()).toEqual(['ops@hb.co.za', 'finance@hb.co.za']);
    expect(component.addError()).toBe('That address is already in the list.');
  });

  it('rejects adding beyond the 50-address cap', () => {
    component.emails.set(Array.from({ length: 50 }, (_, i) => `addr${i}@hb.co.za`));
    component.newEmail.set('overflow@hb.co.za');
    component.addEmail();

    expect(component.emails().length).toBe(50);
    expect(component.addError()).toBe('You can add up to 50 addresses.');
  });

  it('removes an address from the local list', () => {
    component.removeEmail('ops@hb.co.za');

    expect(component.emails()).toEqual(['finance@hb.co.za']);
  });

  it('save() sends the full current array and shows a success confirmation', async () => {
    stub.update.mockReturnValue(of({ notificationEmails: ['finance@hb.co.za', 'new@hb.co.za'] }));

    component.removeEmail('ops@hb.co.za');
    component.newEmail.set('new@hb.co.za');
    component.addEmail();
    component.save();
    await fixture.whenStable();

    expect(stub.update).toHaveBeenCalledWith({ notificationEmails: ['finance@hb.co.za', 'new@hb.co.za'] });
    expect(component.pending()).toBe(false);
    expect(component.saveSuccess()).toBe(true);
    expect(component.saveError()).toBeNull();
  });

  it('a 400 error response surfaces an inline validation message', async () => {
    const validationErr = new HttpErrorResponse({
      status: 400,
      error: { statusCode: 400, message: 'notificationEmails must contain valid email addresses', error: 'Bad Request' },
    });
    stub.update.mockReturnValue(throwError(() => validationErr));

    component.save();
    await fixture.whenStable();

    expect(component.saveError()).toBe('notificationEmails must contain valid email addresses');
    expect(component.saveSuccess()).toBe(false);
    expect(component.pending()).toBe(false);
  });

  it('a generic server error surfaces a fallback message', async () => {
    stub.update.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

    component.save();
    await fixture.whenStable();

    expect(component.saveError()).toBe('Failed to save settings. Please try again.');
    expect(component.saveSuccess()).toBe(false);
    expect(component.pending()).toBe(false);
  });
});

// ─── Load error test (isolated setup) ────────────────────────────────────────

describe('AdminSettings — load error path', () => {
  it('sets error signal and clears loading when get() fails', async () => {
    const failStub: SettingsServiceStub = {
      get: vi.fn(() => throwError(() => new Error('500'))),
      update: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminSettings],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SettingsService, useValue: failStub },
      ],
    }).compileComponents();

    const failFixture = TestBed.createComponent(AdminSettings);
    const failComponent = failFixture.componentInstance;
    failFixture.detectChanges();
    await failFixture.whenStable();

    expect(failComponent.loading()).toBe(false);
    expect(failComponent.error()).toBeTruthy();
  });
});
