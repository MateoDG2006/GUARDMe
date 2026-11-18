import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class BootstrapAccountDto {
  @IsIn(['self', 'caregiver'])
  onboardingKind: 'self' | 'caregiver';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;
}
