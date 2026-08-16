import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactInquiry } from './entities/contact-inquiry.entity';
import { InquiriesService } from './inquiries.service';
import { InquiriesController } from './inquiries.controller';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([ContactInquiry]), MailModule, SettingsModule],
  providers: [InquiriesService],
  controllers: [InquiriesController],
})
export class InquiriesModule {}
