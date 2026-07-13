import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser, AuthedRequest } from './auth-user.interface';

/** Injects the authenticated caller attached by SupabaseAuthGuard. */
export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthUser => {
        const req = ctx.switchToHttp().getRequest<AuthedRequest>();
        return req.user as AuthUser;
    },
);
