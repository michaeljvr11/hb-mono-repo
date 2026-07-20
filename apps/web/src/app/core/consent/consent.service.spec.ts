import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { ConsentService } from './consent.service';

const CONSENT_KEY = 'hb.consent.analytics';

describe('ConsentService (browser)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to "unknown" when nothing is stored', () => {
    const service = TestBed.inject(ConsentService);
    expect(service.status()).toBe('unknown');
  });

  it('grant() persists "granted" and updates the signal', () => {
    const service = TestBed.inject(ConsentService);
    service.grant();

    expect(service.status()).toBe('granted');
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
  });

  it('deny() persists "denied" and updates the signal', () => {
    const service = TestBed.inject(ConsentService);
    service.deny();

    expect(service.status()).toBe('denied');
    expect(localStorage.getItem(CONSENT_KEY)).toBe('denied');
  });

  it('round-trips a prior persisted choice on construction', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    const service = TestBed.inject(ConsentService);

    expect(service.status()).toBe('granted');
  });

  it('treats an unrecognised stored value as "unknown"', () => {
    localStorage.setItem(CONSENT_KEY, 'garbage');
    const service = TestBed.inject(ConsentService);

    expect(service.status()).toBe('unknown');
  });
});

describe('ConsentService (server / SSR)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });
  });

  it('is always "unknown" on the server and never touches storage, even when a choice was persisted client-side', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

    const service = TestBed.inject(ConsentService);

    expect(service.status()).toBe('unknown');
    expect(getItemSpy).not.toHaveBeenCalled();

    getItemSpy.mockRestore();
    localStorage.clear();
  });

  it('grant()/deny() update the in-memory signal without touching storage on the server', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const service = TestBed.inject(ConsentService);

    expect(() => service.grant()).not.toThrow();
    expect(service.status()).toBe('granted');
    expect(setItemSpy).not.toHaveBeenCalled();

    setItemSpy.mockRestore();
  });
});
