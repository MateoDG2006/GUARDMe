import { SetMetadata } from '@nestjs/common';

export const REQUIRE_INSTALLATION = 'requireInstallation';

export const RequireInstallation = () =>
  SetMetadata(REQUIRE_INSTALLATION, true);
