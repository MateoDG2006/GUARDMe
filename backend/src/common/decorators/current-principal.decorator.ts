import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Principal } from '../../modules/identity/principal';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const request = ctx.switchToHttp().getRequest<{ principal: Principal }>();
    return request.principal;
  },
);
