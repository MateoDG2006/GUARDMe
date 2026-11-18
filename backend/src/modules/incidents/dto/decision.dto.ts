import { IsIn, IsInt, Min } from 'class-validator';

export const DECISION_OPTIONS = [
  'take_charge',
  'postpone',
  'request_emergency',
] as const;

export type DecisionOption = (typeof DECISION_OPTIONS)[number];

export class DecideDto {
  @IsIn(DECISION_OPTIONS)
  option: DecisionOption;

  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class EmergencyActionDto {
  @IsIn(['dialer_opened'])
  kind: 'dialer_opened';
}
