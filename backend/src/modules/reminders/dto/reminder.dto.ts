import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isIanaTimeZone', async: false })
class IsIanaTimeZone implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }
}

export class ScheduleDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  localTime: string;

  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek: number[];

  @IsOptional()
  @Validate(IsIanaTimeZone)
  timeZone?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validFrom: string;

  @IsOptional()
  @ValidateIf((_, value) => value != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validTo?: string | null;
}

export class CreateReminderDto {
  @IsIn(['medication', 'appointment'])
  kind: 'medication' | 'appointment';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ScheduleDto)
  schedules: ScheduleDto[];
}

export class UpdateReminderDto {
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ScheduleDto)
  schedules?: ScheduleDto[];
}

export class RespondOccurrenceDto {
  @IsIn(['taken', 'postponed', 'skipped', 'acknowledged'])
  response: 'taken' | 'postponed' | 'skipped' | 'acknowledged';

  @IsInt()
  @Min(1)
  expectedVersion: number;
}
