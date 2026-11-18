import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNBOOTSTRAPPED = 'allowUnbootstrapped';

export const AllowUnbootstrapped = () =>
  SetMetadata(ALLOW_UNBOOTSTRAPPED, true);
