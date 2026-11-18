import { IsIn } from 'class-validator';

export class RespondFollowupDto {
  @IsIn(['well', 'not_well', 'no_followup_needed'])
  option: 'well' | 'not_well' | 'no_followup_needed';
}
