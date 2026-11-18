import { IsIn } from 'class-validator';

export class LogoutDto {
  @IsIn(['installation', 'all'])
  scope: 'installation' | 'all';
}
