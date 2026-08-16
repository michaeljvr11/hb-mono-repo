import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InquiriesService } from './inquiries.service';
import { CreateContactInquiryDto } from './dto/create-contact-inquiry.dto';
import { Public } from '../common/decorators/public.decorator';

// Unauthenticated + triggers an outbound email — same risk profile as
// auth.controller's EMAIL_THROTTLE (credential-less spam/email-bombing).
// Per-IP, tighter than the generous global default (120/60s).
const CONTACT_INQUIRY_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Public()
  @Throttle(CONTACT_INQUIRY_THROTTLE)
  @Post()
  create(@Body() dto: CreateContactInquiryDto) {
    return this.inquiriesService.create(dto);
  }
}
