import { Transform, TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SynonymCreateRequest } from '@hb/shared';

export const SYNONYM_TERM_MAX_LENGTH = 100;
export const SYNONYM_EQUIVALENTS_MAX = 20;

const normalize = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const normalizeEach = ({ value }: TransformFnParams): unknown =>
  Array.isArray(value)
    ? value.map((v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v))
    : value;

export class SynonymCreateDto implements SynonymCreateRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(SYNONYM_TERM_MAX_LENGTH)
  @Transform(normalize)
  term: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SYNONYM_EQUIVALENTS_MAX)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(SYNONYM_TERM_MAX_LENGTH, { each: true })
  @Transform(normalizeEach)
  equivalents: string[];

  @IsOptional()
  @IsBoolean()
  bidirectional?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
