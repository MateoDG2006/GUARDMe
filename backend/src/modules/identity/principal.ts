import type { AccountContext } from '../../infra/db/db.service';

export interface Principal {
  authUserId: string;
  sessionId: string;
  isAnonymous: boolean;
  accountId: string | null;
  installationId: string | null;
}

export function toAccountContext(principal: Principal): AccountContext {
  return {
    accountId: principal.accountId,
    authUserId: principal.authUserId,
    installationId: principal.installationId,
  };
}
