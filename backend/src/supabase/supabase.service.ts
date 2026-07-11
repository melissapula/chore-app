import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Two ways to talk to Supabase:
 *
 *  - serviceClient(): uses the service_role key and BYPASSES RLS. Only trusted
 *    server jobs may use it — the cron timer sweep and parent-creates-kid
 *    onboarding. Never hand it a value derived from a request body.
 *
 *  - userClient(jwt): uses the anon key with the caller's access token, so all
 *    RLS policies apply as that user. This is the default for request handling.
 *
 * Tenant isolation (SPEC §1, §7) lives in RLS, so preferring userClient() keeps
 * the security boundary in the database where it belongs.
 */
@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly url: string;
  private readonly anonKey: string;
  private readonly serviceRoleKey: string;
  private cachedServiceClient?: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.getOrThrow<string>('SUPABASE_URL');
    this.anonKey = this.config.getOrThrow<string>('SUPABASE_ANON_KEY');
    this.serviceRoleKey = this.config.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  /** RLS-bypassing client. Trusted server jobs only. */
  serviceClient(): SupabaseClient {
    if (!this.cachedServiceClient) {
      this.cachedServiceClient = createClient(this.url, this.serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    return this.cachedServiceClient;
  }

  /** Per-request client scoped to a user's JWT so RLS applies. */
  userClient(accessToken: string): SupabaseClient {
    return createClient(this.url, this.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }
}
