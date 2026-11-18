import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  phone: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2])
  priority?: 1 | 2;

  @IsOptional()
  @IsUUID()
  linkedAccountId?: string;

  @IsInt()
  @Min(1)
  expectedContactsVersion: number;
}

export class ContactOrderItemDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  phone?: string;

  @ValidateIf((_, value) => value !== null)
  @IsIn([1, 2])
  priority: 1 | 2 | null;
}

@ValidatorConstraint({ name: 'uniqueContactPriority', async: false })
class UniqueContactPriority implements ValidatorConstraintInterface {
  validate(items: ContactOrderItemDto[]): boolean {
    if (!Array.isArray(items)) return false;
    const priorities = items
      .map((item) => item.priority)
      .filter((priority) => priority != null);
    return new Set(priorities).size === priorities.length;
  }

  defaultMessage(): string {
    return 'Las prioridades no pueden repetirse';
  }
}

export class UpdateContactsDto {
  @IsInt()
  @Min(1)
  expectedContactsVersion: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactOrderItemDto)
  @Validate(UniqueContactPriority)
  items: ContactOrderItemDto[];
}
