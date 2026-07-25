<script setup lang="ts">
// Post-login home. Two states:
//   1. No chore.users row yet  → show the bootstrap form (creates household +
//      parent row via the bootstrap_household RPC).
//   2. Has a profile           → show the (placeholder) dashboard.
// RLS makes a brand-new user's profile query return empty until bootstrap runs,
// which is exactly how we distinguish the two states.
import type { AvatarValue } from '~/types/avatar';

const supabase = useSupabaseClient();
const { supported: pushSupported, enable: enablePush } = usePush();

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

// onboarding: create a new household, or join an existing one with a code.
const setupMode = ref<'create' | 'join'>('create');
const formHousehold = ref('');
const formDisplayName = ref('');
const joinCode = ref('');
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

async function onJoin() {
    error.value = null;
    if (!joinCode.value.trim() || !formDisplayName.value.trim()) {
        error.value = 'Invite code and your name are both required.';
        return;
    }
    submitting.value = true;
    const { error: err } = await supabase
        .schema('chore')
        .rpc('join_household', {
            invite_code: joinCode.value.trim(),
            display_name: formDisplayName.value.trim(),
            avatar_emoji:
                avatar.value?.kind === 'emoji' ? avatar.value.emoji : null,
        });
    if (err) {
        submitting.value = false;
        error.value = err.message;
        return;
    }
    // Same as bootstrap: an uploaded image self-updates after the row exists.
    if (avatar.value?.kind === 'image' && uid.value) {
        const { error: upErr } = await supabase
            .from('users')
            .update({ avatar_url: avatar.value.dataUrl })
            .eq('id', uid.value);
        if (upErr) {
            error.value = `Joined, but the avatar didn't save: ${upErr.message}`;
        }
    }
    submitting.value = false;
    await loadProfile();
}

// Web push opt-in (shown once we've confirmed the device supports it).
const pushOk = ref(false);
const pushBusy = ref(false);
const pushDone = ref(false);
const pushMsg = ref<string | null>(null);

async function onEnablePush() {
    pushMsg.value = null;
    pushBusy.value = true;
    try {
        await enablePush();
        pushDone.value = true;
    } catch (e) {
        pushMsg.value = (e as Error).message;
    }
    pushBusy.value = false;
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
    pushOk.value = pushSupported();
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
            <div class="cta">
                <template v-if="profile.role === 'parent'">
                    <NuxtLink to="/chores">
                        <mfp-button variant="primary"
                            >⚔️ Manage chores</mfp-button
                        >
                    </NuxtLink>
                    <NuxtLink to="/family">
                        <mfp-button variant="secondary">👪 Family</mfp-button>
                    </NuxtLink>
                    <NuxtLink to="/pay">
                        <mfp-button variant="secondary"
                            >💵 Weekly pay</mfp-button
                        >
                    </NuxtLink>
                </template>
                <template v-else>
                    <NuxtLink to="/board">
                        <mfp-button variant="primary"
                            >🗺️ Quest Board</mfp-button
                        >
                    </NuxtLink>
                    <NuxtLink to="/quests">
                        <mfp-button variant="secondary"
                            >🎁 My quests</mfp-button
                        >
                    </NuxtLink>
                </template>
            </div>
            <p v-if="pushOk" class="pushrow">
                <mfp-button
                    variant="ghost"
                    :disabled="pushBusy || pushDone"
                    @click="onEnablePush"
                >
                    {{
                        pushDone
                            ? '🔔 Notifications on ✓'
                            : pushBusy
                              ? 'Enabling…'
                              : '🔔 Enable notifications'
                    }}
                </mfp-button>
                <span v-if="pushMsg" class="pushmsg">{{ pushMsg }}</span>
            </p>
            <p class="signout">
                <mfp-button variant="ghost" @click="signOut"
                    >Sign out</mfp-button
                >
            </p>
        </template>

        <!-- No household yet → create one, or join with an invite code -->
        <template v-else>
            <h1>
                {{
                    setupMode === 'create'
                        ? '🏡 Create your household'
                        : '🔑 Join a household'
                }}
            </h1>

            <div class="tabs" role="tablist">
                <button
                    type="button"
                    class="tab"
                    :class="{ active: setupMode === 'create' }"
                    role="tab"
                    :aria-selected="setupMode === 'create'"
                    @click="setupMode = 'create'"
                >
                    Create new
                </button>
                <button
                    type="button"
                    class="tab"
                    :class="{ active: setupMode === 'join' }"
                    role="tab"
                    :aria-selected="setupMode === 'join'"
                    @click="setupMode = 'join'"
                >
                    Join with a code
                </button>
            </div>

            <!-- Create a brand-new household (you become the first parent) -->
            <form v-if="setupMode === 'create'" @submit.prevent="onBootstrap">
                <p class="muted">
                    Set up your family. You'll be the parent — you can add kids
                    and invite a co-parent next.
                </p>
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

            <!-- Join an existing household as a co-parent with an invite code -->
            <form v-else @submit.prevent="onJoin">
                <p class="muted">
                    Got an invite code from another parent? Enter it to join
                    their household.
                </p>
                <mfp-input
                    label="Invite code"
                    name="code"
                    placeholder="A3F9C2B1"
                    autocapitalize="characters"
                    @input="
                        joinCode = ($event.target as HTMLInputElement).value
                    "
                />
                <mfp-input
                    label="Your name"
                    name="joinName"
                    placeholder="Alex"
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
                    {{ submitting ? 'Joining…' : 'Join household' }}
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
.tabs {
    display: flex;
    gap: 0.5rem;
    margin: 1.25rem 0 0;
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
.pushrow {
    margin-top: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    align-items: flex-start;
}
.pushmsg {
    font-size: 0.85rem;
    color: var(--color-text-muted);
}
.signout {
    margin-top: 0.5rem;
}
</style>
