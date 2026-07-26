import {
  IsEnum,
  IsString,
  MaxLength,
  isUUID,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { VendorProfileSection, VendorSectionType } from '@hb/shared';

const CURATED_PRODUCT_IDS_MAX = 24;

/**
 * Enforces the curated/category discriminated union structurally (not just via
 * @ValidateIf, which only *skips* validation on the false branch and would still
 * let a whitelisted 'productIds' array ride through untouched on a category
 * section — the exact bypass this decorator closes):
 *  - type 'curated': productIds must be a non-empty array (<= 24) of v4 uuids.
 *  - type 'category': productIds must be absent entirely.
 * Whether those product ids actually belong to the vendor being edited is a
 * semantic, ownership-dependent check enforced in VendorsService.update().
 */
function IsCuratedProductIds(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCuratedProductIds',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as VendorProfileSectionDto;
          if (dto.type === VendorSectionType.CURATED) {
            return (
              Array.isArray(value) &&
              value.length > 0 &&
              value.length <= CURATED_PRODUCT_IDS_MAX &&
              value.every((v) => typeof v === 'string' && isUUID(v, '4'))
            );
          }
          return value === undefined;
        },
        defaultMessage() {
          return (
            `productIds must be a non-empty array of up to ${CURATED_PRODUCT_IDS_MAX} ` +
            `product ids for a curated section, and must be omitted for any other section type`
          );
        },
      },
    });
  };
}

/**
 * Mirror of IsCuratedProductIds for the category branch: 'category' sections
 * require a single valid categoryId; every other section type must omit it.
 */
function IsCategoryId(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCategoryId',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as VendorProfileSectionDto;
          if (dto.type === VendorSectionType.CATEGORY) {
            return typeof value === 'string' && isUUID(value, '4');
          }
          return value === undefined;
        },
        defaultMessage() {
          return 'categoryId is required for a category section, and must be omitted for any other section type';
        },
      },
    });
  };
}

export class VendorProfileSectionDto implements VendorProfileSection {
  @IsString()
  @MaxLength(64)
  id: string;

  @IsString()
  @MaxLength(120)
  title: string;

  @IsEnum(VendorSectionType)
  type: VendorSectionType;

  @IsCuratedProductIds()
  productIds?: string[];

  @IsCategoryId()
  categoryId?: string;
}
