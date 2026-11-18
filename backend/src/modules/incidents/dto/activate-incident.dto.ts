import { Type } from 'class-transformer';
import { PublishLocationDto } from '../../location/dto/location.dto';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export class ConnectivityDto {
  @IsIn(['wifi', 'cellular', 'none', 'unknown'])
  network: 'wifi' | 'cellular' | 'none' | 'unknown';

  @IsBoolean()
  bleLinked: boolean;
}

export class ActivateIncidentDto {
  @IsIn(['fall_detected', 'manual_emergency'])
  origin: 'fall_detected' | 'manual_emergency';

  @IsString()
  @Matches(/^[A-Za-z0-9:_-]{1,128}$/)
  sourceEventId: string;

  @ValidateIf((input: ActivateIncidentDto) => input.origin === 'fall_detected')
  @IsUUID()
  caneId?: string;

  @ValidateIf(
    (input: ActivateIncidentDto) => input.origin === 'manual_emergency',
  )
  @IsUUID()
  profileId?: string;

  @IsISO8601()
  reportedOccurredAt: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(SEVEN_DAYS_MS)
  ageAtSendMs?: number;

  @IsString()
  @MinLength(1)
  protocolVersion: string;

  @IsOptional()
  @IsString()
  bootId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence?: number;

  @IsOptional()
  @IsISO8601()
  windowStartedAt?: string;

  @IsOptional()
  @IsISO8601()
  windowEndedAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectivityDto)
  connectivity?: ConnectivityDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PublishLocationDto)
  location?: PublishLocationDto;
}
