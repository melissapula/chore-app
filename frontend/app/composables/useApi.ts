// Thin wrapper around $fetch for calling the NestJS API with the current
// Supabase access token. Chore templates + the paid state machine live on the
// backend (behind SupabaseAuthGuard), unlike auth/profile which hit Supabase
// directly.
export function useApi() {
    const supabase = useSupabaseClient();
    const base = useRuntimeConfig().public.apiBase as string;

    async function authFetch<T>(
        path: string,
        opts: Parameters<typeof $fetch>[1] = {},
    ): Promise<T> {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('Not signed in');
        return await $fetch<T>(`${base}${path}`, {
            ...opts,
            headers: {
                ...(opts.headers as Record<string, string>),
                Authorization: `Bearer ${token}`,
            },
        });
    }

    return { authFetch };
}
