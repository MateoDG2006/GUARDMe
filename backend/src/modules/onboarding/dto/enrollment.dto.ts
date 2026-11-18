import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class IssueEnrollmentDto {
  @IsIn(['initial', 'replace_user'])
  purpose: 'initial' | 'replace_user';
}

export class ConsumeEnrollmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code: string;

  @IsUUID()
  clientInstallationId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  appVersion: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  pushToken?: string;
}
