<script setup lang="ts">
// Magic-link callback target (nuxt.config → supabase.redirectOptions.callback).
// @nuxtjs/supabase (PKCE via @supabase/ssr) exchanges the link's `?code=` for a
// session. We wait for that, surface any provider error, and fall back to a
// retry prompt instead of hanging forever.
const user = useSupabaseUser();
const supabase = useSupabaseClient();

const message = ref('One moment while we finish logging you in.');
const failed = ref(false);

// If the session lands (via the module's code exchange), move on.
watch(
    user,
    (u) => {
        if (u) navigateTo('/dashboard');
    },
    { immediate: true },
);

onMounted(async () => {
    // Surface an error the provider passed back in the URL (query or hash).
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const providerError =
        url.searchParams.get('error_description') ||
        hash.get('error_description') ||
        url.searchParams.get('error') ||
        hash.get('error');
    if (providerError) {
        failed.value = true;
        message.value = decodeURIComponent(providerError);
        return;
    }

    // Give the module's automatic detectSessionInUrl a moment to settle first,
    // so we don't race its own code exchange.
    for (let i = 0; i < 8; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
            navigateTo('/dashboard');
            return;
        }
        await new Promise((r) => setTimeout(r, 300));
    }

    // Still no session — run the PKCE exchange ourselves and show the real error
    // instead of a generic timeout.
    const code = url.searchParams.get('code');
    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
            failed.value = true;
            message.value = `Sign-in failed: ${error.message}`;
            return;
        }
        navigateTo('/dashboard');
        return;
    }

    failed.value = true;
    message.value =
        'No sign-in code was found in that link. Please request a fresh one.';
});
</script>

<template>
    <main class="wrap">
        <h1>⚔️ {{ failed ? 'Sign-in incomplete' : 'Signing you in…' }}</h1>
        <p>{{ message }}</p>
        <p v-if="failed" class="retry">
            <NuxtLink to="/login">
                <mfp-button variant="primary">Back to log in</mfp-button>
            </NuxtLink>
        </p>
    </main>
</template>

<style scoped>
.wrap {
    max-width: 32rem;
    margin: 4rem auto;
    padding: 0 1rem;
    text-align: center;
    font-family: var(--font-family-sans);
    color: var(--color-text-default);
}
h1 {
    font-family: 'Baloo 2', var(--font-family-sans);
    color: var(--color-brand-primary);
}
p {
    color: var(--color-text-muted);
}
.retry {
    margin-top: 1.5rem;
}
</style>
