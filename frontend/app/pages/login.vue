<script setup lang="ts">
// Passwordless sign-in via a 6-digit email OTP (no magic link → no PKCE / no
// cross-browser redirect problem). Two steps: request a code, then verify it.
// verifyOtp establishes the session directly on this client, so we just route
// to the dashboard afterward — no /confirm callback needed for this flow.
//
// Values are read from the <mfp-input> host's `value` property via @input; that
// works for both the component's custom event and the native (composed) one.
const supabase = useSupabaseClient();
const email = ref('');
const code = ref('');
const step = ref<'email' | 'code'>('email');
const error = ref<string | null>(null);
const busy = ref(false);

async function sendCode() {
    error.value = null;
    const address = (email.value || '').trim();
    if (!address) {
        error.value = 'Please enter your email.';
        return;
    }
    busy.value = true;
    const { error: err } = await supabase.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: true },
    });
    busy.value = false;
    if (err) {
        error.value = err.message;
        return;
    }
    step.value = 'code';
}

async function verify() {
    error.value = null;
    const token = (code.value || '').trim();
    if (!token) {
        error.value = 'Enter the 6-digit code from your email.';
        return;
    }
    busy.value = true;
    const { error: err } = await supabase.auth.verifyOtp({
        email: (email.value || '').trim(),
        token,
        type: 'email',
    });
    busy.value = false;
    if (err) {
        error.value = err.message;
        return;
    }
    navigateTo('/dashboard');
}

function restart() {
    step.value = 'email';
    code.value = '';
    error.value = null;
}
</script>

<template>
    <main class="wrap">
        <h1>Log in</h1>

        <!-- Step 1: request a code -->
        <form v-if="step === 'email'" @submit.prevent="sendCode">
            <mfp-input
                name="email"
                type="email"
                label="Email"
                placeholder="you@example.com"
                @input="email = ($event.target as HTMLInputElement).value"
            />
            <mfp-button type="submit" variant="primary" :disabled="busy">
                {{ busy ? 'Sending…' : 'Send code' }}
            </mfp-button>
            <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
        </form>

        <!-- Step 2: enter the code -->
        <form v-else @submit.prevent="verify">
            <p class="sent">
                We emailed a 6-digit code to <strong>{{ email }}</strong
                >.
            </p>
            <mfp-input
                name="code"
                type="text"
                label="6-digit code"
                placeholder="123456"
                inputmode="numeric"
                autocomplete="one-time-code"
                @input="code = ($event.target as HTMLInputElement).value"
            />
            <mfp-button type="submit" variant="primary" :disabled="busy">
                {{ busy ? 'Verifying…' : 'Verify & log in' }}
            </mfp-button>
            <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
            <mfp-button type="button" variant="ghost" @click="restart">
                Use a different email
            </mfp-button>
        </form>

        <p class="back"><NuxtLink to="/">← Back</NuxtLink></p>
    </main>
</template>

<style scoped>
.wrap {
    max-width: 22rem;
    margin: 4rem auto;
    padding: 0 1rem;
    font-family: var(--font-family-sans);
    color: var(--color-text-default);
}
h1 {
    font-family: 'Baloo 2', var(--font-family-sans);
    color: var(--color-brand-primary);
}
form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
.sent {
    color: var(--color-text-muted);
    margin: 0;
}
.back {
    margin-top: 1.5rem;
}
</style>
