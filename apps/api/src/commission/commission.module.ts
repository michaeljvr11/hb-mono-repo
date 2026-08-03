import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionRate } from './entities/commission-rate.entity';
import { CommissionRateService } from './commission-rate.service';
import { CommissionController } from './commission.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CommissionRate])],
  providers: [CommissionRateService],
  controllers: [CommissionController],
  exports: [CommissionRateService],
})
export class CommissionModule {}
