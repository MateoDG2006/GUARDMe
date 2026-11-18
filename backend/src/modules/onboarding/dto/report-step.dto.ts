import { IsIn, IsOptional, IsUUID } from 'class-validator';

export const DEVICE_STEPS = [
  'intent_selected',
  'pin_set',
  'permissions_granted',
  'end_to_end_test',
] as const;

export class ReportStepDto {
  @IsOptional()
  @IsUUID()
  profileId?: string;

  @IsIn(DEVICE_STEPS)
  step: (typeof DEVICE_STEPS)[number];

  @IsIn(['done', 'blocked', 'skipped'])
  status: 'done' | 'blocked' | 'skipped';

  @IsOptional()
  @IsIn([
    'permission_denied',
    'cane_not_found',
    'invitation_pending',
    'provider_not_integrated',
    'user_skipped',
  ])
  reason?:
    | 'permission_denied'
    | 'cane_not_found'
    | 'invitation_pending'
    | 'provider_not_integrated'
    | 'user_skipped';
}
