import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

export function isIanaTimeZone(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

@ValidatorConstraint({ name: 'profileRelation', async: false })
class ProfileRelationConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateProfileDto;
    if (dto.relation === 'caregiver') {
      return (
        dto.caregiverCategory === 'family' ||
        dto.caregiverCategory === 'medical'
      );
    }
    return dto.relation === 'user' && dto.caregiverCategory == null;
  }

  defaultMessage(): string {
    return 'La relación y la categoría no coinciden';
  }
}

export class CreateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName: string;

  @IsOptional()
  @IsString()
  timeZone?: string;

  @IsIn(['user', 'caregiver'])
  @Validate(ProfileRelationConstraint)
  relation: 'user' | 'caregiver';

  @IsOptional()
  @IsIn(['family', 'medical'])
  caregiverCategory?: 'family' | 'medical';
}
