import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthUser } from './auth-user.interface';

/**
 * Validates the `Authorization: Bearer <jwt>` header against Supabase Auth,
 * then loads the caller's chore profile (household + role) and attaches it to
 * the request as `req.user`. Downstream handlers read it via @CurrentUser().
 *
 * The profile lookup uses the service client (a trusted read keyed on the
 * already-validated auth uid); all *mutations* in the services use the caller's
 * own JWT so RLS still applies as defense in depth.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const { data, error } = await this.supabase
      .userClient(token)
      .auth.getUser(token);
    if (error || !data?.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const { data: profile, error: profileErr } = await this.supabase
      .serviceClient()
      .from('users')
      .select('household_id, role')
      .eq('id', data.user.id)
      .single();
    if (profileErr || !profile) {
      throw new UnauthorizedException(
        'No chore profile for this user — call bootstrap_household first',
      );
    }

    const user: AuthUser = {
      id: data.user.id,
      householdId: profile.household_id,
      role: profile.role,
      accessToken: token,
    };
    req.user = user;
    return true;
  }
}
