<script setup lang="ts">
// Parent-only: the household roster + "add a kid" flow. Creating a kid hits the
// NestJS POST /kids (service role admin-creates the auth user + chore profile);
// the kid then logs in with the username + PIN shown here. Members are read
// straight from Supabase (RLS scopes to the household).
import type { AvatarValue } from '~/types/avatar';

const supabase = useSupabaseClient();
const { authFetch } = useApi();

interface Member {
    id: string;
    display_name: string;
    role: 'parent' | 'kid';
    username: string | null;
    avatar_emoji: string | null;
    avatar_url: string | null;
}

const uid = ref<string | null>(null);
const householdId = ref<string | null>(null);
const isParent = ref(false);
const members = ref<Member[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

// XP balances per kid (sum of ledger deltas). Parent sees all via RLS.
const xpByKid = ref<Record<string, number>>({});
// Active personal quests per kid — the parent redeems the ready ones.
interface Quest {
    id: string;
    kid_id: string;
    title: string;
    reward: string | null;
    target_xp: number;
}
const questsByKid = ref<Record<string, Quest[]>>({});
const redeemBusy = ref<string | null>(null);

async function loadQuests() {
    const { data } = await supabase
        .from('quests')
        .select('id, kid_id, title, reward, target_xp')
        .eq('scope', 'personal')
        .eq('status', 'active');
    const byKid: Record<string, Quest[]> = {};
    for (const q of (data ?? []) as Quest[]) {
        (byKid[q.kid_id] ??= []).push(q);
    }
    questsByKid.value = byKid;
}

// Quests this kid can afford right now (spendable ≥ target).
function readyQuests(kidId: string): Quest[] {
    const bal = xpByKid.value[kidId] ?? 0;
    return (questsByKid.value[kidId] ?? []).filter((q) => bal >= q.target_xp);
}

async function redeemQuest(q: Quest) {
    error.value = null;
    redeemBusy.value = q.id;
    const { error: err } = await supabase
        .schema('chore')
        .rpc('redeem_quest', { p_quest_id: q.id });
    redeemBusy.value = null;
    if (err) {
        error.value = err.message;
        return;
    }
    await Promise.all([loadBalances(), loadQuests()]);
}
// Inline "adjust XP" state — which kid's adjuster is open + its fields.
const adjustingId = ref<string | null>(null);
const adjustAmount = ref('');
const adjustNote = ref('');
const adjustBusy = ref(false);

async function loadBalances() {
    const { data, error: err } = await supabase
        .from('ledger_entries')
        .select('kid_id, delta_cents');
    if (err) return; // non-fatal; roster still renders
    const totals: Record<string, number> = {};
    for (const r of (data ?? []) as { kid_id: string; delta_cents: number }[]) {
        totals[r.kid_id] = (totals[r.kid_id] ?? 0) + r.delta_cents;
    }
    xpByKid.value = totals;
}

function startAdjust(kidId: string) {
    adjustingId.value = kidId;
    adjustAmount.value = '';
    adjustNote.value = '';
    error.value = null;
}

function cancelAdjust() {
    adjustingId.value = null;
}

async function saveAdjust(kidId: string) {
    error.value = null;
    const amt = Math.round(Number(adjustAmount.value));
    if (!amt || Number.isNaN(amt)) {
        error.value = 'Enter a non-zero XP amount (use - to take away).';
        return;
    }
    if (!householdId.value) {
        error.value = 'Still loading — try again in a second.';
        return;
    }
    adjustBusy.value = true;
    const { error: err } = await supabase.from('ledger_entries').insert({
        household_id: householdId.value,
        kid_id: kidId,
        delta_cents: amt,
        reason: 'parent_adjustment',
        note: adjustNote.value.trim() || null,
    });
    adjustBusy.value = false;
    if (err) {
        error.value = err.message;
        return;
    }
    adjustingId.value = null;
    await loadBalances();
}

// add-kid form
const displayName = ref('');
const username = ref('');
const usernameEdited = ref(false);
const pin = ref('');
const avatar = ref<AvatarValue | null>(null);
const avatarPickerOpen = ref(false);
const creating = ref(false);
// The just-created kid — surfaced so the parent can relay the login.
const created = ref<{
    display_name: string;
    username: string;
    pin: string;
} | null>(null);

// edit-kid state (inline)
const editKidId = ref<string | null>(null);
const editName = ref('');
const editUsername = ref('');
const editPin = ref('');
const editAvatar = ref<AvatarValue | null>(null);
const editAvatarOpen = ref(false);
const savingKid = ref(false);

function startEditKid(m: Member) {
    editKidId.value = m.id;
    editName.value = m.display_name;
    editUsername.value = m.username ?? '';
    editPin.value = '';
    editAvatar.value = m.avatar_url
        ? { kind: 'image', dataUrl: m.avatar_url }
        : m.avatar_emoji
          ? { kind: 'emoji', emoji: m.avatar_emoji }
          : null;
    error.value = null;
}
function cancelEditKid() {
    editKidId.value = null;
}
async function saveKid() {
    if (!editKidId.value) return;
    error.value = null;
    const name = editName.value.trim();
    const uname = editUsername.value.trim().toLowerCase();
    if (!name) {
        error.value = 'Give your kid a name.';
        return;
    }
    if (!/^[a-z0-9_-]{2,20}$/.test(uname)) {
        error.value =
            'Username must be 2–20 characters: letters, numbers, _ or -.';
        return;
    }
    if (editPin.value && !/^\d{4,8}$/.test(editPin.value.trim())) {
        error.value = 'PIN must be 4–8 digits (or leave it blank to keep it).';
        return;
    }
    savingKid.value = true;
    const body: Record<string, unknown> = {
        display_name: name,
        username: uname,
    };
    if (editPin.value.trim()) body.pin = editPin.value.trim();
    if (editAvatar.value?.kind === 'emoji') {
        body.avatar_emoji = editAvatar.value.emoji;
        body.avatar_url = null;
    } else if (editAvatar.value?.kind === 'image') {
        body.avatar_emoji = null;
        body.avatar_url = editAvatar.value.dataUrl;
    }
    try {
        await authFetch(`/kids/${editKidId.value}`, {
            method: 'PATCH',
            body,
        });
        editKidId.value = null;
        await loadMembers();
    } catch (e) {
        error.value = apiMessage(e);
    }
    savingKid.value = false;
}

// delete-kid confirm
const removeKidConfirm = ref<string | null>(null);
const removingKid = ref(false);
async function removeKid(kidId: string) {
    error.value = null;
    removingKid.value = true;
    try {
        await authFetch(`/kids/${kidId}`, { method: 'DELETE' });
        removeKidConfirm.value = null;
        editKidId.value = null;
        await loadMembers();
    } catch (e) {
        error.value = apiMessage(e);
    }
    removingKid.value = false;
}

// edit-own-profile (parent) — name + avatar, via RLS (id = auth.uid()).
const editParentId = ref<string | null>(null);
const editParentName = ref('');
const editParentAvatar = ref<AvatarValue | null>(null);
const editParentAvatarOpen = ref(false);
const savingParent = ref(false);
function startEditParent(m: Member) {
    editParentId.value = m.id;
    editParentName.value = m.display_name;
    editParentAvatar.value = m.avatar_url
        ? { kind: 'image', dataUrl: m.avatar_url }
        : m.avatar_emoji
          ? { kind: 'emoji', emoji: m.avatar_emoji }
          : null;
    error.value = null;
}
function cancelEditParent() {
    editParentId.value = null;
}
async function saveParent() {
    if (!editParentId.value) return;
    error.value = null;
    if (!editParentName.value.trim()) {
        error.value = 'Give yourself a name.';
        return;
    }
    savingParent.value = true;
    const patch: Record<string, unknown> = {
        display_name: editParentName.value.trim(),
    };
    if (editParentAvatar.value?.kind === 'emoji') {
        patch.avatar_emoji = editParentAvatar.value.emoji;
        patch.avatar_url = null;
    } else if (editParentAvatar.value?.kind === 'image') {
        patch.avatar_emoji = null;
        patch.avatar_url = editParentAvatar.value.dataUrl;
    }
    const { error: err } = await supabase
        .from('users')
        .update(patch)
        .eq('id', editParentId.value);
    savingParent.value = false;
    if (err) {
        error.value = err.message;
        return;
    }
    editParentId.value = null;
    await loadMembers();
}

const kids = computed(() => members.value.filter((m) => m.role === 'kid'));
const parents = computed(() =>
    members.value.filter((m) => m.role === 'parent'),
);

// co-parent invite
const inviteCode = ref<string | null>(null);
const inviteBusy = ref(false);
const copied = ref(false);

async function getInviteCode() {
    error.value = null;
    inviteBusy.value = true;
    const { data, error: err } = await supabase
        .schema('chore')
        .rpc('regenerate_join_code');
    inviteBusy.value = false;
    if (err) {
        error.value = err.message;
        return;
    }
    inviteCode.value = data as string;
    copied.value = false;
}

async function copyCode() {
    if (!inviteCode.value) return;
    try {
        await navigator.clipboard.writeText(inviteCode.value);
        copied.value = true;
    } catch {
        // Clipboard blocked (insecure context / permissions) — no-op; the code
        // is on screen to read.
    }
}

// Suggest a username from the display name until the parent edits it directly.
function slugify(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '')
        .slice(0, 20);
}
watch(displayName, (name) => {
    if (!usernameEdited.value) username.value = slugify(name);
});

function apiMessage(e: unknown): string {
    const err = e as { data?: { message?: string }; message?: string };
    const m = (err?.data?.message ?? err?.message) as unknown;
    return Array.isArray(m)
        ? m.join(', ')
        : (m as string) || 'Something went wrong';
}

async function loadMembers() {
    loading.value = true;
    error.value = null;
    const { data, error: err } = await supabase
        .from('users')
        .select('id, display_name, role, username, avatar_emoji, avatar_url')
        .order('created_at', { ascending: true });
    if (err) {
        error.value = err.message;
    } else {
        members.value = (data ?? []) as Member[];
    }
    loading.value = false;
}

async function addKid() {
    error.value = null;
    created.value = null;
    const name = displayName.value.trim();
    const uname = username.value.trim().toLowerCase();
    const p = pin.value.trim();
    if (!name) {
        error.value = 'Give your kid a name.';
        return;
    }
    if (!/^[a-z0-9_-]{2,20}$/.test(uname)) {
        error.value =
            'Username must be 2–20 characters: letters, numbers, _ or -.';
        return;
    }
    if (!/^\d{4,8}$/.test(p)) {
        error.value = 'PIN must be 4–8 digits.';
        return;
    }
    creating.value = true;
    try {
        await authFetch('/kids', {
            method: 'POST',
            body: {
                display_name: name,
                username: uname,
                pin: p,
                avatar_emoji:
                    avatar.value?.kind === 'emoji'
                        ? avatar.value.emoji
                        : undefined,
                avatar_url:
                    avatar.value?.kind === 'image'
                        ? avatar.value.dataUrl
                        : undefined,
            },
        });
        created.value = { display_name: name, username: uname, pin: p };
        // Reset for the next kid.
        displayName.value = '';
        username.value = '';
        usernameEdited.value = false;
        pin.value = '';
        avatar.value = null;
        await loadMembers();
    } catch (e) {
        error.value = apiMessage(e);
    }
    creating.value = false;
}

onMounted(async () => {
    const { data, error: err } = await supabase.auth.getUser();
    if (err || !data.user) {
        navigateTo('/login');
        return;
    }
    uid.value = data.user.id;
    const { data: me } = await supabase
        .from('users')
        .select('role, household_id')
        .eq('id', uid.value)
        .maybeSingle();
    const meRow = me as { role?: string; household_id?: string } | null;
    isParent.value = meRow?.role === 'parent';
    householdId.value = meRow?.household_id ?? null;
    if (!isParent.value) {
        // Kids don't manage the household.
        navigateTo('/dashboard');
        return;
    }
    await Promise.all([loadMembers(), loadBalances(), loadQuests()]);
});
</script>

<template>
    <main class="wrap">
        <p class="back"><NuxtLink to="/dashboard">← Dashboard</NuxtLink></p>
        <h1>👪 Your family</h1>

        <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>

        <!-- Add a kid -->
        <section class="card">
            <h2>Add a kid</h2>
            <form @submit.prevent="addKid">
                <mfp-input
                    label="Kid's name"
                    name="displayName"
                    placeholder="Rowan"
                    :value.prop="displayName"
                    @input="
                        displayName = ($event.target as HTMLInputElement).value
                    "
                />
                <mfp-input
                    label="Username (they log in with this)"
                    name="username"
                    placeholder="rowan"
                    autocapitalize="none"
                    :value.prop="username"
                    @input="
                        username = ($event.target as HTMLInputElement).value;
                        usernameEdited = true;
                    "
                />
                <mfp-input
                    label="PIN (4–8 digits)"
                    name="pin"
                    type="text"
                    inputmode="numeric"
                    placeholder="1234"
                    :value.prop="pin"
                    @input="pin = ($event.target as HTMLInputElement).value"
                />
                <div class="avatar-field">
                    <span class="avatar-label">Avatar</span>
                    <div class="avatar-row">
                        <span class="avatar-preview">
                            <img
                                v-if="avatar?.kind === 'image'"
                                :src="avatar.dataUrl"
                                alt="Kid avatar"
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
                    :disabled="creating"
                >
                    {{ creating ? 'Adding…' : 'Add kid' }}
                </mfp-button>
            </form>

            <mfp-alert v-if="created" variant="success" class="created">
                <strong>{{ created.display_name }}</strong> is ready! They log
                in on the <em>Kid</em> tab with username
                <strong>{{ created.username }}</strong> and PIN
                <strong>{{ created.pin }}</strong
                >.
            </mfp-alert>
        </section>

        <!-- Invite a co-parent -->
        <section class="card">
            <h2>Invite a co-parent</h2>
            <p class="muted">
                Generate a one-time code. Your co-parent creates their own
                account on the <em>Parent</em> tab, then enters this code to
                join as a parent.
            </p>
            <div v-if="inviteCode" class="code-box">
                <code>{{ inviteCode }}</code>
                <mfp-button variant="ghost" @click="copyCode">
                    {{ copied ? 'Copied ✓' : 'Copy' }}
                </mfp-button>
            </div>
            <mfp-button
                variant="secondary"
                :disabled="inviteBusy"
                @click="getInviteCode"
            >
                {{
                    inviteBusy
                        ? 'Generating…'
                        : inviteCode
                          ? 'New code'
                          : 'Get invite code'
                }}
            </mfp-button>
            <p v-if="inviteCode" class="muted small">
                Single-use — it stops working once they join, or when you
                generate a new one.
            </p>
        </section>

        <p v-if="loading" class="muted">Loading…</p>

        <!-- Roster -->
        <section v-if="!loading" class="card">
            <h2>Grown-ups</h2>
            <ul class="list">
                <li v-for="m in parents" :key="m.id" class="kid-row">
                    <div class="item">
                        <span class="avatar">
                            <img
                                v-if="m.avatar_url"
                                :src="m.avatar_url"
                                alt=""
                            />
                            <template v-else>{{
                                m.avatar_emoji || '🧑'
                            }}</template>
                        </span>
                        <span class="grow">
                            <strong>{{ m.display_name }}</strong>
                            <span v-if="m.id === uid" class="uname">you</span>
                        </span>
                        <button
                            v-if="m.id === uid"
                            class="edit-btn"
                            aria-label="Edit your profile"
                            title="Edit"
                            @click="
                                editParentId === m.id
                                    ? cancelEditParent()
                                    : startEditParent(m)
                            "
                        >
                            ✏️
                        </button>
                        <span class="role-badge">parent</span>
                    </div>

                    <!-- Edit your own name + avatar -->
                    <div v-if="editParentId === m.id" class="kid-edit">
                        <mfp-input
                            label="Your name"
                            name="editParentName"
                            :value.prop="editParentName"
                            @input="
                                editParentName = (
                                    $event.target as HTMLInputElement
                                ).value
                            "
                        />
                        <div class="avatar-field">
                            <span class="avatar-label">Avatar</span>
                            <div class="avatar-row">
                                <span class="avatar-preview">
                                    <img
                                        v-if="
                                            editParentAvatar?.kind === 'image'
                                        "
                                        :src="editParentAvatar.dataUrl"
                                        alt="Your avatar"
                                    />
                                    <template v-else>{{
                                        editParentAvatar?.emoji || '🙂'
                                    }}</template>
                                </span>
                                <mfp-button
                                    type="button"
                                    variant="secondary"
                                    @click="editParentAvatarOpen = true"
                                >
                                    Change avatar
                                </mfp-button>
                            </div>
                        </div>
                        <div class="edit-actions">
                            <mfp-button
                                variant="primary"
                                :disabled="savingParent"
                                @click="saveParent"
                            >
                                {{ savingParent ? 'Saving…' : 'Save changes' }}
                            </mfp-button>
                            <mfp-button
                                variant="ghost"
                                @click="cancelEditParent"
                            >
                                Cancel
                            </mfp-button>
                        </div>
                    </div>
                </li>
            </ul>

            <h2 class="kids-h">Kids</h2>
            <p v-if="!kids.length" class="muted">
                No kids yet — add your first above.
            </p>
            <ul v-else class="list">
                <li v-for="m in kids" :key="m.id" class="kid-row">
                    <div class="item">
                        <span class="avatar">
                            <img
                                v-if="m.avatar_url"
                                :src="m.avatar_url"
                                alt=""
                            />
                            <template v-else>{{
                                m.avatar_emoji || '🦸'
                            }}</template>
                        </span>
                        <span class="grow">
                            <strong>{{ m.display_name }}</strong>
                            <span class="uname">@{{ m.username }}</span>
                        </span>
                        <span class="kid-xp"
                            >⭐ {{ xpByKid[m.id] || 0 }} XP</span
                        >
                        <button
                            class="edit-btn"
                            aria-label="Edit kid"
                            title="Edit"
                            @click="
                                editKidId === m.id
                                    ? cancelEditKid()
                                    : startEditKid(m)
                            "
                        >
                            ✏️
                        </button>
                        <mfp-button
                            variant="ghost"
                            @click="
                                adjustingId === m.id
                                    ? cancelAdjust()
                                    : startAdjust(m.id)
                            "
                        >
                            {{ adjustingId === m.id ? 'Close' : 'Adjust' }}
                        </mfp-button>
                    </div>

                    <!-- Inline edit: name / login / avatar -->
                    <div v-if="editKidId === m.id" class="kid-edit">
                        <mfp-input
                            label="Name"
                            name="editName"
                            :value.prop="editName"
                            @input="
                                editName = ($event.target as HTMLInputElement)
                                    .value
                            "
                        />
                        <mfp-input
                            label="Username"
                            name="editUsername"
                            autocapitalize="none"
                            :value.prop="editUsername"
                            @input="
                                editUsername = (
                                    $event.target as HTMLInputElement
                                ).value
                            "
                        />
                        <mfp-input
                            label="Reset PIN (leave blank to keep)"
                            name="editPin"
                            type="text"
                            inputmode="numeric"
                            placeholder="••••"
                            :value.prop="editPin"
                            @input="
                                editPin = ($event.target as HTMLInputElement)
                                    .value
                            "
                        />
                        <div class="avatar-field">
                            <span class="avatar-label">Avatar</span>
                            <div class="avatar-row">
                                <span class="avatar-preview">
                                    <img
                                        v-if="editAvatar?.kind === 'image'"
                                        :src="editAvatar.dataUrl"
                                        alt="Kid avatar"
                                    />
                                    <template v-else>{{
                                        editAvatar?.emoji || '🙂'
                                    }}</template>
                                </span>
                                <mfp-button
                                    type="button"
                                    variant="secondary"
                                    @click="editAvatarOpen = true"
                                >
                                    Change avatar
                                </mfp-button>
                            </div>
                        </div>
                        <div class="edit-actions">
                            <mfp-button
                                variant="primary"
                                :disabled="savingKid"
                                @click="saveKid"
                            >
                                {{ savingKid ? 'Saving…' : 'Save changes' }}
                            </mfp-button>
                            <mfp-button variant="ghost" @click="cancelEditKid">
                                Cancel
                            </mfp-button>
                        </div>

                        <!-- Danger zone: remove the kid entirely -->
                        <div class="danger-zone">
                            <button
                                v-if="removeKidConfirm !== m.id"
                                type="button"
                                class="danger-link"
                                @click="removeKidConfirm = m.id"
                            >
                                Remove {{ m.display_name }} from the household
                            </button>
                            <div v-else class="remove-confirm">
                                <span class="remove-q">
                                    This permanently deletes their account, XP,
                                    and quests. Sure?
                                </span>
                                <div class="remove-btns">
                                    <mfp-button
                                        variant="danger"
                                        :disabled="removingKid"
                                        @click="removeKid(m.id)"
                                    >
                                        {{
                                            removingKid ? 'Removing…' : 'Remove'
                                        }}
                                    </mfp-button>
                                    <mfp-button
                                        variant="ghost"
                                        @click="removeKidConfirm = null"
                                    >
                                        Keep
                                    </mfp-button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Inline adjuster: give a bonus or dock XP (parent_adjustment) -->
                    <div v-if="adjustingId === m.id" class="adjuster">
                        <div class="adjuster-row">
                            <mfp-input
                                class="amt-in"
                                label="XP (use - to take away)"
                                type="number"
                                inputmode="numeric"
                                placeholder="25"
                                :value.prop="adjustAmount"
                                @input="
                                    adjustAmount = (
                                        $event.target as HTMLInputElement
                                    ).value
                                "
                            />
                            <mfp-input
                                class="note-in"
                                label="Note (optional)"
                                placeholder="Bonus for helping"
                                :value.prop="adjustNote"
                                @input="
                                    adjustNote = (
                                        $event.target as HTMLInputElement
                                    ).value
                                "
                            />
                        </div>
                        <mfp-button
                            variant="primary"
                            :disabled="adjustBusy"
                            @click="saveAdjust(m.id)"
                        >
                            {{ adjustBusy ? 'Saving…' : 'Save adjustment' }}
                        </mfp-button>
                    </div>

                    <!-- Quests this kid can afford → grant the reward + redeem -->
                    <div
                        v-for="q in readyQuests(m.id)"
                        :key="q.id"
                        class="redeem-row"
                    >
                        <span class="redeem-info">
                            🎁 <strong>{{ q.title }}</strong>
                            <span class="redeem-cost"
                                >{{ q.target_xp }} XP</span
                            >
                        </span>
                        <mfp-button
                            variant="primary"
                            :disabled="redeemBusy === q.id"
                            @click="redeemQuest(q)"
                        >
                            {{ redeemBusy === q.id ? 'Redeeming…' : 'Redeem' }}
                        </mfp-button>
                    </div>
                </li>
            </ul>
        </section>

        <AvatarPickerModal v-model:open="avatarPickerOpen" v-model="avatar" />
        <AvatarPickerModal v-model:open="editAvatarOpen" v-model="editAvatar" />
        <AvatarPickerModal
            v-model:open="editParentAvatarOpen"
            v-model="editParentAvatar"
        />
    </main>
</template>

<style scoped>
.wrap {
    max-width: 32rem;
    margin: 2rem auto;
    padding: 0 1rem;
    font-family: var(--font-family-sans);
    color: var(--color-text-default);
}
.back {
    margin: 0 0 0.5rem;
}
h1 {
    font-family: 'Baloo 2', var(--font-family-sans);
    color: var(--color-brand-primary);
    margin-bottom: 1rem;
}
h2 {
    font-family: 'Baloo 2', var(--font-family-sans);
    font-size: 1.1rem;
    margin: 0 0 0.75rem;
}
.kids-h {
    margin-top: 1.25rem;
}
.muted {
    color: var(--color-text-muted);
}
.card {
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-surface-muted, #eee);
    border-radius: var(--radius-lg, 1rem);
    padding: 1rem;
    margin-bottom: 1.25rem;
}
form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}
.created {
    margin-top: 1rem;
}
.small {
    font-size: 0.8rem;
    margin-top: 0.5rem;
}
.code-box {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-brand-subtle, #efe7ff);
}
.code-box code {
    font-family: ui-monospace, 'Cascadia Code', monospace;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--color-brand-primary, #6c4ce0);
    flex: 1;
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
.avatar-preview,
.avatar {
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
.avatar {
    width: 2.5rem;
    height: 2.5rem;
    font-size: 1.3rem;
}
.avatar-preview img,
.avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface-muted, #f5f3f7);
}
.grow {
    flex: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}
.uname {
    font-size: 0.85rem;
    color: var(--color-text-muted);
}
.kid-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.edit-btn {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 1.1rem;
    padding: 0.2rem;
    line-height: 1;
}
.kid-edit {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-brand-subtle, #efe7ff);
}
.edit-actions {
    display: flex;
    gap: 0.5rem;
}
.danger-zone {
    margin-top: 0.5rem;
    padding-top: 0.6rem;
    border-top: 1px solid rgba(179, 38, 30, 0.2);
}
.danger-link {
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    font-size: 0.85rem;
    color: #b3261e;
    text-decoration: underline;
    cursor: pointer;
}
.remove-confirm {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.remove-q {
    font-size: 0.85rem;
    font-weight: 700;
    color: #b3261e;
}
.remove-btns {
    display: flex;
    gap: 0.5rem;
}
.kid-xp {
    font-size: 0.9rem;
    font-weight: 800;
    color: var(--color-brand-primary, #6c4ce0);
    white-space: nowrap;
}
.adjuster {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.75rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-brand-subtle, #efe7ff);
}
.adjuster-row {
    display: flex;
    gap: 0.6rem;
}
.redeem-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md, 0.75rem);
    background: #e7f7ea;
}
.redeem-info {
    font-size: 0.9rem;
}
.redeem-cost {
    color: #1f7a34;
    font-weight: 700;
    margin-left: 0.4rem;
}
.amt-in {
    width: 9rem;
    flex: none;
}
.note-in {
    flex: 1;
}
.role-badge {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: #e6e0f5;
    color: #4a3aa8;
}
.role-badge.kid {
    background: #d8ecff;
    color: #1c5fa8;
}
</style>
