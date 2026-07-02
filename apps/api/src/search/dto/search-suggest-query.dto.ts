import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { SearchSuggestQuery } from '@hb/shared';

export class SearchSuggestQueryDto implements SearchSuggestQuery {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  q: string;
}
