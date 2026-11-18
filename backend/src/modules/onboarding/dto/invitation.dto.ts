import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class IssueInvitationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  recipientHint?: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  secret: string;

  @IsIn(['family', 'medical'])
  caregiverCategory: 'family' | 'medical';
}

export class RejectInvitationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  secret: string;
}
