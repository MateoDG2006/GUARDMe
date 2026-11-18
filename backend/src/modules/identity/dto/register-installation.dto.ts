import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterInstallationDto {
  @IsUUID()
  clientInstallationId: string;

  @IsIn(['android'])
  platform: 'android';

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
