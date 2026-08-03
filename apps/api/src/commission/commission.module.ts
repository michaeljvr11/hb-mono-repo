import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionRate } from './entities/commission-rate.entity';
import { CommissionRateService } from './commission-rate.service';
import { CommissionController } from './commission.controller';

// @Global so VE-3 (order-item rate snapshot at order-creation time) can inject
// CommissionRateService without importing this module — same pattern as AuditModule.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([CommissionRate])],
  providers: [CommissionRateService],
  controllers: [CommissionController],
  exports: [CommissionRateService],
})
export class CommissionModule {}
