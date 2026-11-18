import { IsIn } from 'class-validator';

export class AcknowledgeDto {
  @IsIn(['received', 'opened'])
  kind: 'received' | 'opened';
}
