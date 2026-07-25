<script setup lang="ts">
// Two sign-in modes:
//   • Parent — email + password. New parents Sign up (creates the auth user);
//     returning parents Log in. If the Supabase project requires email
//     confirmation, signUp returns no session → we tell them to confirm first.
//   • Kid — username + PIN. Kids have no inbox; the backend admin-created their
//     auth user with credentials DERIVED from username + PIN, so we recompute
//     the same email/password here. The derivation MUST match
//     backend/src/kids/kid-auth.ts byte-for-byte.
//
// <mfp-input> values are read from the host's `value` via @input (works for both
// the component's custom event and the native composed one).
const supabase = useSupabaseClient();

const mode = ref<'parent' | 'kid'>('parent');
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const busy = ref(false);

// --- parent (email + password) ---
const authMode = ref<'login' | 'signup'>('login');
const email = ref('');
const password = ref('');
const confirm = ref('');

async function parentLogin() {
    error.value = null;
    notice.value = null;
    const address = (email.value || '').trim();
    if (!address || !password.value) {
        error.value = 'Enter your email and password.';
        return;
    }
    busy.value = true;
    const { error: err } = await supabase.auth.signInWithPassword({
        email: address,
        password: password.value,
    });
    busy.value = false;
    if (err) {
        error.value = 'That email or password isn’t right.';
        return;
    }
    navigateTo('/dashboard');
}

async function parentSignup() {
    error.value = null;
    notice.value = null;
    const address = (email.value || '').trim();
    if (!address) {
        error.value = 'Enter your email.';
        return;
    }
    if (password.value.length < 6) {
        error.value = 'Password must be at least 6 characters.';
        return;
    }
    if (password.value !== confirm.value) {
        error.value = 'Passwords don’t match.';
        return;
    }
    busy.value = true;
    const { data, error: err } = await supabase.auth.signUp({
        email: address,
        password: password.value,
    });
    busy.value = false;
    if (err) {
        error.value = err.message;
        return;
    }
    if (data.session) {
        // No email confirmation required → we're signed in.
        navigateTo('/dashboard');
        return;
    }
    // Confirmation required: no session yet.
    notice.value =
        'Almost there! Check your email to confirm your account, then log in.';
    authMode.value = 'login';
    password.value = '';
    confirm.value = '';
}

// --- kid (username + PIN) ---
// Keep in sync with backend/src/kids/kid-auth.ts.
const KID_EMAIL_DOMAIN = 'choreq.local';
const kidUsername = ref('');
const kidPin = ref('');

async function kidLogin() {
    error.value = null;
    notice.value = null;
    const username = (kidUsername.value || '').trim().toLowerCase();
    const pin = (kidPin.value || '').trim();
    if (!username || !pin) {
        error.value = 'Enter your username and PIN.';
        return;
    }
    busy.value = true;
    const { error: err } = await supabase.auth.signInWithPassword({
        email: `${username}@${KID_EMAIL_DOMAIN}`,
        password: `choreq_${pin}`,
    });
    busy.value = false;
    if (err) {
        error.value = 'That username or PIN isn’t right. Try again!';
        return;
    }
    navigateTo('/dashboard');
}

function switchMode(m: 'parent' | 'kid') {
    mode.value = m;
    error.value = null;
    notice.value = null;
}

function switchAuth(m: 'login' | 'signup') {
    authMode.value = m;
    error.value = null;
    notice.value = null;
    password.value = '';
    confirm.value = '';
}
</script>

<template>
    <main class="wrap">
        <h1>Log in</h1>

        <div class="tabs" role="tablist">
            <button
                type="button"
                class="tab"
                :class="{ active: mode === 'parent' }"
                role="tab"
                :aria-selected="mode === 'parent'"
                @click="switchMode('parent')"
            >
                🧑‍🍼 Parent
            </button>
            <button
                type="button"
                class="tab"
                :class="{ active: mode === 'kid' }"
                role="tab"
                :aria-selected="mode === 'kid'"
                @click="switchMode('kid')"
            >
                🦸 Kid
            </button>
        </div>

        <!-- PARENT: email + password -->
        <template v-if="mode === 'parent'">
            <form v-if="authMode === 'login'" @submit.prevent="parentLogin">
                <mfp-input
                    name="email"
                    type="email"
                    label="Email"
                    placeholder="you@example.com"
                    autocomplete="email"
                    @input="email = ($event.target as HTMLInputElement).value"
                />
                <mfp-input
                    name="password"
                    type="password"
                    label="Password"
                    autocomplete="current-password"
                    @input="
                        password = ($event.target as HTMLInputElement).value
                    "
                />
                <mfp-button type="submit" variant="primary" :disabled="busy">
                    {{ busy ? 'Logging in…' : 'Log in' }}
                </mfp-button>
                <mfp-alert v-if="notice" variant="success">{{
                    notice
                }}</mfp-alert>
                <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
                <p class="swap">
                    New here?
                    <button
                        type="button"
                        class="link"
                        @click="switchAuth('signup')"
                    >
                        Create an account
                    </button>
                </p>
            </form>

            <!-- PARENT: sign up -->
            <form v-else @submit.prevent="parentSignup">
                <mfp-input
                    name="email"
                    type="email"
                    label="Email"
                    placeholder="you@example.com"
                    autocomplete="email"
                    @input="email = ($event.target as HTMLInputElement).value"
                />
                <mfp-input
                    name="password"
                    type="password"
                    label="Password (6+ characters)"
                    autocomplete="new-password"
                    @input="
                        password = ($event.target as HTMLInputElement).value
                    "
                />
                <mfp-input
                    name="confirm"
                    type="password"
                    label="Confirm password"
                    autocomplete="new-password"
                    @input="confirm = ($event.target as HTMLInputElement).value"
                />
                <mfp-button type="submit" variant="primary" :disabled="busy">
                    {{ busy ? 'Creating…' : 'Create account' }}
                </mfp-button>
                <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
                <p class="swap">
                    Have an account?
                    <button
                        type="button"
                        class="link"
                        @click="switchAuth('login')"
                    >
                        Log in
                    </button>
                </p>
            </form>
        </template>

        <!-- KID: username + PIN -->
        <template v-else>
            <form @submit.prevent="kidLogin">
                <p class="sent">
                    Enter the username and PIN your parent set up.
                </p>
                <mfp-input
                    name="username"
                    type="text"
                    label="Username"
                    placeholder="rowan"
                    autocapitalize="none"
                    autocomplete="username"
                    @input="
                        kidUsername = ($event.target as HTMLInputElement).value
                    "
                />
                <mfp-input
                    name="pin"
                    type="password"
                    label="PIN"
                    placeholder="••••"
                    inputmode="numeric"
                    autocomplete="current-password"
                    @input="kidPin = ($event.target as HTMLInputElement).value"
                />
                <mfp-button type="submit" variant="primary" :disabled="busy">
                    {{ busy ? 'Logging in…' : 'Log in' }}
                </mfp-button>
                <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
            </form>
        </template>

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
.tabs {
    display: flex;
    gap: 0.5rem;
    margin: 0 0 1.25rem;
}
.tab {
    flex: 1;
    padding: 0.6rem 0.5rem;
    border: 2px solid var(--color-surface-muted, #e6e0f5);
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface, #fff);
    color: var(--color-text-muted);
    font-family: var(--font-family-sans);
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
}
.tab.active {
    border-color: var(--color-brand-primary, #6c4ce0);
    background: var(--color-brand-subtle, #efe7ff);
    color: var(--color-brand-primary, #6c4ce0);
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
.swap {
    margin: 0;
    font-size: 0.9rem;
    color: var(--color-text-muted);
}
.link {
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    font-weight: 700;
    color: var(--color-brand-primary, #6c4ce0);
    cursor: pointer;
    text-decoration: underline;
}
.back {
    margin-top: 1.5rem;
}
</style>
