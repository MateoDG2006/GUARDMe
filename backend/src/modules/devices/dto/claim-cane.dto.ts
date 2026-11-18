import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ClaimCaneDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  serial: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  claimCode: string;

  @IsUUID()
  profileId: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  proximityProof?: string;
}
