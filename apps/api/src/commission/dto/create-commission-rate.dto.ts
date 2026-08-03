import { IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CreateCommissionRateRequest } from '@hb/shared';

export class CreateCommissionRateDto implements CreateCommissionRateRequest {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  ratePercent: number;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
