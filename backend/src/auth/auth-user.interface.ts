/** The authenticated caller, resolved by SupabaseAuthGuard and attached to the request. */
export interface AuthUser {
    /** Supabase Auth user id (= chore.users.id). */
    id: string;
    /** The household this user belongs to (tenant boundary). */
    householdId: string;
    role: 'parent' | 'kid';
    /** The caller's JWT, so services can act as them (RLS applies). */
    accessToken: string;
}

/** Minimal request shape the guard reads/writes (avoids an express types dep). */
export interface AuthedRequest {
    headers: { authorization?: string };
    user?: AuthUser;
}
