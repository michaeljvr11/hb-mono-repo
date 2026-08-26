import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ConsentBanner } from './consent-banner';
import { ConsentService, ConsentStatus } from '../consent.service';

interface ConsentStub {
  status: ReturnType<typeof signal<ConsentStatus>>;
  grant: ReturnType<typeof vi.fn>;
  deny: ReturnType<typeof vi.fn>;
}

function makeConsentStub(initial: ConsentStatus): ConsentStub {
  const status = signal<ConsentStatus>(initial);
  return {
    status,
    grant: vi.fn(() => status.set('granted')),
    deny: vi.fn(() => status.set('denied')),
  };
}

async function setup(
  consentStub: ConsentStub,
  platform: 'browser' | 'server' = 'browser',
): Promise<ComponentFixture<ConsentBanner>> {
  await TestBed.configureTestingModule({
    imports: [ConsentBanner],
    providers: [
      provideRouter([]),
      { provide: ConsentService, useValue: consentStub },
      { provide: PLATFORM_ID, useValue: platform },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ConsentBanner);
  fixture.detectChanges();
  return fixture;
}

describe('ConsentBanner', () => {
  it('renders when consent is "unknown" in the browser', async () => {
    const consentStub = makeConsentStub('unknown');
    const fixture = await setup(consentStub);

    expect(fixture.nativeElement.querySelector('.consent-banner')).toBeTruthy();
  });

  it('links to the real Cookie Policy and Privacy Policy pages', async () => {
    const consentStub = makeConsentStub('unknown');
    const fixture = await setup(consentStub);

    const links: HTMLAnchorElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.consent-banner__text a'),
    );
    const hrefs = links.map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/legal/cookies');
    expect(hrefs).toContain('/legal/privacy');
  });

  it('is hidden when consent is already "granted"', async () => {
    const consentStub = makeConsentStub('granted');
    const fixture = await setup(consentStub);

    expect(fixture.nativeElement.querySelector('.consent-banner')).toBeNull();
  });

  it('is hidden when consent is already "denied"', async () => {
    const consentStub = makeConsentStub('denied');
    const fixture = await setup(consentStub);

    expect(fixture.nativeElement.querySelector('.consent-banner')).toBeNull();
  });

  it('renders nothing on the server, even while consent is "unknown" (no hydration mismatch)', async () => {
    const consentStub = makeConsentStub('unknown');
    const fixture = await setup(consentStub, 'server');

    expect(fixture.nativeElement.querySelector('.consent-banner')).toBeNull();
  });

  it('Accept grants and persists consent', async () => {
    const consentStub = makeConsentStub('unknown');
    const fixture = await setup(consentStub);

    const acceptBtn = fixture.nativeElement.querySelector(
      '.consent-banner__btn--accept',
    ) as HTMLButtonElement;
    acceptBtn.click();
    fixture.detectChanges();

    expect(consentStub.grant).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.consent-banner')).toBeNull();
  });

  it('Decline denies and persists consent', async () => {
    const consentStub = makeConsentStub('unknown');
    const fixture = await setup(consentStub);

    const declineBtn = fixture.nativeElement.querySelector(
      '.consent-banner__btn--decline',
    ) as HTMLButtonElement;
    declineBtn.click();
    fixture.detectChanges();

    expect(consentStub.deny).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.consent-banner')).toBeNull();
  });
});
