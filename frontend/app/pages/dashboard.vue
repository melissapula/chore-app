<script setup lang="ts">
// Post-login home. Two states:
//   1. No chore.users row yet  → show the bootstrap form (creates household +
//      parent row via the bootstrap_household RPC).
//   2. Has a profile           → show the (placeholder) dashboard.
// RLS makes a brand-new user's profile query return empty until bootstrap runs,
// which is exactly how we distinguish the two states.
import type { AvatarValue } from '~/types/avatar';

const supabase = useSupabaseClient();

interface Profile {
    id: string;
    household_id: string;
    display_name: string;
    role: 'parent' | 'kid';
    avatar_emoji: string | null;
    avatar_url: string | null;
}

// Authenticated user's id — resolved via getUser() in onMounted (deterministic,
// unlike the reactive user ref which can lag/partially-populate on hydration).
const uid = ref<string | null>(null);
const profile = ref<Profile | null>(null);
const householdName = ref<string>('');
const loading = ref(true);
const error = ref<string | null>(null);

// bootstrap form fields
const formHousehold = ref('');
const formDisplayName = ref('');
const avatar = ref<AvatarValue | null>(null);
const submitting = ref(false);
const avatarPickerOpen = ref(false);

async function loadProfile() {
    if (!uid.value) return;
    loading.value = true;
    error.value = null;
    const { data, error: err } = await supabase
        .from('users')
        .select(
            'id, household_id, display_name, role, avatar_emoji, avatar_url',
        )
        .eq('id', uid.value)
        .maybeSingle();
    if (err) {
        error.value = err.message;
    } else if (data) {
        profile.value = data as Profile;
        const { data: hh } = await supabase
            .from('households')
            .select('name')
            .eq('id', profile.value.household_id)
            .maybeSingle();
        householdName.value = hh?.name ?? '';
    }
    loading.value = false;
}

async function onBootstrap() {
    error.value = null;
    if (!formHousehold.value.trim() || !formDisplayName.value.trim()) {
        error.value = 'Household name and your name are both required.';
        return;
    }
    submitting.value = true;
    const { error: err } = await supabase
        .schema('chore')
        .rpc('bootstrap_household', {
            household_name: formHousehold.value.trim(),
            display_name: formDisplayName.value.trim(),
            avatar_emoji:
                avatar.value?.kind === 'emoji' ? avatar.value.emoji : null,
        });
    if (err) {
        submitting.value = false;
        error.value = err.message;
        return;
    }
    // An uploaded image isn't part of the bootstrap RPC — persist it with a
    // self-update now that the users row exists (RLS allows id = auth.uid()).
    if (avatar.value?.kind === 'image' && uid.value) {
        const { error: upErr } = await supabase
            .from('users')
            .update({ avatar_url: avatar.value.dataUrl })
            .eq('id', uid.value);
        if (upErr) {
            // Non-fatal: the household exists; just surface it.
            error.value = `Household created, but the avatar didn't save: ${upErr.message}`;
        }
    }
    submitting.value = false;
    await loadProfile();
}

async function signOut() {
    await supabase.auth.signOut();
    navigateTo('/');
}

// Resolve the authenticated user authoritatively, then load their profile.
// getUser() returns the real session user (or null) without depending on the
// reactive ref's hydration timing — which is what was leaving us stuck.
onMounted(async () => {
    const { data, error: err } = await supabase.auth.getUser();
    if (err || !data.user) {
        // Not signed in (or the session is invalid) — back to login.
        navigateTo('/login');
        return;
    }
    uid.value = data.user.id;
    await loadProfile();
});
</script>

<template>
    <main class="wrap">
        <template v-if="loading">
            <p>Loading…</p>
        </template>

        <!-- Has a household → dashboard -->
        <template v-else-if="profile">
            <h1>
                <img
                    v-if="profile.avatar_url"
                    class="greeting-avatar"
                    :src="profile.avatar_url"
                    alt="Your avatar"
                />
                <span v-else>{{ profile.avatar_emoji || '👋' }}</span>
                Hi, {{ profile.display_name }}!
            </h1>
            <p class="muted">
                Household: <strong>{{ householdName }}</strong> · Role:
                <strong class="role">{{ profile.role }}</strong>
            </p>
            <p class="cta">
                <NuxtLink to="/chores">
                    <mfp-button variant="primary">⚔️ Manage chores</mfp-button>
                </NuxtLink>
            </p>
            <p class="signout">
                <mfp-button variant="ghost" @click="signOut"
                    >Sign out</mfp-button
                >
            </p>
        </template>

        <!-- No household yet → bootstrap form -->
        <template v-else>
            <h1>🏡 Create your household</h1>
            <p class="muted">
                Let's set up your family. You'll be the parent — you can add
                kids next.
            </p>
            <form @submit.prevent="onBootstrap">
                <mfp-input
                    label="Household name"
                    name="household"
                    placeholder="The Freundschuh-Pulas"
                    @input="
                        formHousehold = ($event.target as HTMLInputElement)
                            .value
                    "
                />
                <mfp-input
                    label="Your name"
                    name="displayName"
                    placeholder="Missa"
                    @input="
                        formDisplayName = ($event.target as HTMLInputElement)
                            .value
                    "
                />
                <div class="avatar-field">
                    <span class="avatar-label">Your avatar</span>
                    <div class="avatar-row">
                        <span class="avatar-preview">
                            <img
                                v-if="avatar?.kind === 'image'"
                                :src="avatar.dataUrl"
                                alt="Your avatar"
                            />
                            <template v-else>{{
                                avatar?.emoji || '🙂'
                            }}</template>
                        </span>
                        <mfp-button
                            type="button"
                            variant="secondary"
                            @click="avatarPickerOpen = true"
                        >
                            {{ avatar ? 'Change avatar' : 'Choose avatar' }}
                        </mfp-button>
                    </div>
                </div>
                <mfp-button
                    type="submit"
                    variant="primary"
                    :disabled="submitting"
                >
                    {{ submitting ? 'Creating…' : 'Create household' }}
                </mfp-button>
                <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
            </form>

            <AvatarPickerModal
                v-model:open="avatarPickerOpen"
                v-model="avatar"
            />
        </template>
    </main>
</template>

<style scoped>
.wrap {
    max-width: 26rem;
    margin: 4rem auto;
    padding: 0 1rem;
    font-family: var(--font-family-sans);
    color: var(--color-text-default);
}
h1 {
    font-family: 'Baloo 2', var(--font-family-sans);
    color: var(--color-brand-primary);
}
.muted {
    color: var(--color-text-muted);
}
.role {
    text-transform: capitalize;
}
h1 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.greeting-avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    object-fit: cover;
    box-shadow: inset 0 0 0 2px var(--color-brand-primary);
}
form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1.5rem;
}
.avatar-field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}
.avatar-label {
    font-weight: 700;
    font-size: 0.9rem;
}
.avatar-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
.avatar-preview {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.6rem;
    background: var(--color-surface-muted, #f5f3f7);
    flex: none;
}
.avatar-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.signout {
    margin-top: 1.5rem;
}
</style>
