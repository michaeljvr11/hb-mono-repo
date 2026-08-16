import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContactInquiryDto, CreateContactInquiryRequest, InquiryOrderType } from '@hb/shared';

import { ContactService } from './contact.service';
import { environment } from '../../../environments/environment';

const REQUEST: CreateContactInquiryRequest = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  orderType: InquiryOrderType.ONE_TIME,
  message: 'Please source this for me.',
};

const RESPONSE: ContactInquiryDto = {
  id: 'inquiry-1',
  receivedAt: '2026-08-16T09:00:00.000Z',
};

describe('ContactService', () => {
  let service: ContactService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ContactService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('create() POSTs the inquiry payload and returns the acknowledgement', () => {
    let result: ContactInquiryDto | undefined;
    service.create(REQUEST).subscribe((dto) => (result = dto));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/inquiries`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(REQUEST);
    req.flush(RESPONSE);

    expect(result).toEqual(RESPONSE);
  });

  it('propagates a server error to the caller', () => {
    let error: unknown;
    service.create(REQUEST).subscribe({ error: (err) => (error = err) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/inquiries`);
    req.flush({ message: 'Bad request' }, { status: 400, statusText: 'Bad Request' });

    expect(error).toBeTruthy();
  });
});
