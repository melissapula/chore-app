<script setup lang="ts">
// Parent view for both chore flows:
//   • Paid (SPEC §2)     — gamified template + spawn into the claimable pool.
//   • Required (SPEC §3a) — assigned to one kid, has a due date, no race/timer;
//     kid marks done → parent confirms. Can gate the week's pay.
import type { RealtimeChannel } from '@supabase/supabase-js';

const { authFetch } = useApi();
const supabase = useSupabaseClient();

interface Chore {
    id: string;
    title: string;
    icon_emoji: string | null;
    chore_type: 'paid' | 'required';
    value_cents: number;
    assigned_kid_id: string | null;
    due_type: string | null;
    gates_pay: boolean;
    active: boolean;
}

interface Instance {
    id: string;
    state: string;
    value_cents_snapshot: number;
    claimed_by: string | null;
    assigned_to: string | null;
    due_date: string | null;
    gates_pay: boolean;
    chores: {
        title: string;
        icon_emoji: string | null;
        chore_type: string;
    } | null;
}

interface Kid {
    id: string;
    display_name: string;
}

const templates = ref<Chore[]>([]);
const pool = ref<Instance[]>([]);
const kids = ref<Kid[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const busyId = ref<string | null>(null);
const openNotes = ref<string | null>(null); // instance id whose note thread is open

// new-chore form
const choreType = ref<'paid' | 'required'>('paid');
const title = ref('');
const emoji = ref('');
const xp = ref<number | null>(null);
const assignedKid = ref('');
const dueType = ref<'end_of_day' | 'end_of_week'>('end_of_day');
const gatesPay = ref(false);
const creating = ref(false);

// mfp-input wants a string value; render the numeric XP (or empty) for binding.
const xpDisplay = computed(() => (xp.value === null ? '' : String(xp.value)));

function kidName(id: string | null): string {
    if (!id) return 'a kid';
    return kids.value.find((k) => k.id === id)?.display_name ?? 'a kid';
}

// Fill the paid form from a picked preset (gamified chore, or a custom one).
function onPreset(p: { title: string; emoji: string; xp: number }) {
    title.value = p.title;
    emoji.value = p.emoji || '';
    xp.value = p.xp || null;
}

function switchType(t: 'paid' | 'required') {
    choreType.value = t;
    // Reset shared fields so a paid preset doesn't bleed into a required chore.
    title.value = '';
    emoji.value = '';
    xp.value = null;
    error.value = null;
}

const STATE_LABEL: Record<string, string> = {
    OPEN: 'Open',
    CLAIMED: 'Claimed',
    IN_PROGRESS: 'In progress',
    SUBMITTED: 'Submitted',
    APPROVED: 'Approved',
    ASSIGNED: 'Assigned',
    CONFIRMED: 'Confirmed',
    MISSED: 'Missed',
};

function apiMessage(e: unknown): string {
    const err = e as { data?: { message?: string }; message?: string };
    return err?.data?.message || err?.message || 'Something went wrong';
}

async function loadAll(silent = false) {
    if (!silent) loading.value = true;
    error.value = null;
    try {
        const [t, p] = await Promise.all([
            authFetch<Chore[]>('/chores'),
            authFetch<Instance[]>('/chore-instances'),
        ]);
        templates.value = t;
        pool.value = p;
    } catch (e) {
        error.value = apiMessage(e);
    }
    if (!silent) loading.value = false;
}

async function loadKids() {
    const { data } = await supabase
        .from('users')
        .select('id, display_name, role')
        .eq('role', 'kid');
    kids.value = (data ?? []) as Kid[];
}

async function createChore() {
    error.value = null;
    if (!title.value.trim()) {
        error.value = 'Give your chore a name.';
        return;
    }
    if (choreType.value === 'required' && !assignedKid.value) {
        error.value = 'Pick which kid this required chore is for.';
        return;
    }
    creating.value = true;
    try {
        const body =
            choreType.value === 'paid'
                ? {
                      title: title.value.trim(),
                      chore_type: 'paid' as const,
                      icon_emoji: emoji.value.trim() || undefined,
                      value_cents:
                          xp.value && xp.value > 0 ? Math.round(xp.value) : 0,
                  }
                : {
                      title: title.value.trim(),
                      chore_type: 'required' as const,
                      icon_emoji: emoji.value.trim() || undefined,
                      assigned_kid_id: assignedKid.value,
                      due_type: dueType.value,
                      gates_pay: gatesPay.value,
                  };
        await authFetch<Chore>('/chores', { method: 'POST', body });
        title.value = '';
        emoji.value = '';
        xp.value = null;
        gatesPay.value = false;
        await loadAll();
    } catch (e) {
        error.value = apiMessage(e);
    }
    creating.value = false;
}

// Spawn a live instance: paid → OPEN pool; required → ASSIGNED to its kid.
async function addToPool(id: string) {
    error.value = null;
    busyId.value = id;
    try {
        await authFetch(`/chores/${id}/instances`, { method: 'POST' });
        await loadAll();
    } catch (e) {
        error.value = apiMessage(e);
    }
    busyId.value = null;
}

// Parent actions on a live instance.
//   approve  — paid SUBMITTED → APPROVED (+ XP)
//   confirm  — required SUBMITTED → CONFIRMED
//   release  — paid → OPEN (send back / free a stuck claim)
async function act(id: string, action: 'approve' | 'confirm' | 'release') {
    error.value = null;
    busyId.value = id;
    try {
        await authFetch(`/chore-instances/${id}/${action}`, { method: 'POST' });
        await loadAll();
    } catch (e) {
        error.value = apiMessage(e);
    }
    busyId.value = null;
}

let channel: RealtimeChannel | null = null;

onMounted(async () => {
    await Promise.all([loadAll(), loadKids()]);
    // Live pool: reflect kids claiming / starting / submitting as it happens,
    // plus cron-driven changes. RLS scopes it to this household.
    channel = supabase
        .channel('chores-pool')
        .on(
            'postgres_changes',
            { event: '*', schema: 'chore', table: 'chore_instances' },
            () => void loadAll(true),
        )
        .subscribe();
});

onUnmounted(() => {
    if (channel) void supabase.removeChannel(channel);
});
</script>

<template>
    <main class="wrap">
        <p class="back"><NuxtLink to="/dashboard">← Dashboard</NuxtLink></p>
        <h1>⚔️ Chores</h1>

        <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>

        <!-- Create -->
        <section class="card">
            <h2>New chore</h2>

            <div class="tabs" role="tablist">
                <button
                    type="button"
                    class="tab"
                    :class="{ active: choreType === 'paid' }"
                    role="tab"
                    :aria-selected="choreType === 'paid'"
                    @click="switchType('paid')"
                >
                    💰 Paid
                </button>
                <button
                    type="button"
                    class="tab"
                    :class="{ active: choreType === 'required' }"
                    role="tab"
                    :aria-selected="choreType === 'required'"
                    @click="switchType('required')"
                >
                    📌 Required
                </button>
            </div>

            <form @submit.prevent="createChore">
                <!-- PAID: gamified picker + XP -->
                <template v-if="choreType === 'paid'">
                    <ChorePicker @select="onPreset" />

                    <div v-if="title" class="chosen">
                        <span class="chosen-emoji">{{ emoji || '📋' }}</span>
                        <strong>{{ title }}</strong>
                    </div>

                    <div v-if="title" class="row">
                        <mfp-input
                            class="emoji-in"
                            label="Icon"
                            name="emoji"
                            :value.prop="emoji"
                            @input="
                                emoji = ($event.target as HTMLInputElement)
                                    .value
                            "
                        />
                        <mfp-input
                            class="xp-in"
                            label="XP reward"
                            name="xp"
                            type="number"
                            inputmode="numeric"
                            :value.prop="xpDisplay"
                            @input="
                                xp =
                                    Number(
                                        ($event.target as HTMLInputElement)
                                            .value,
                                    ) || null
                            "
                        />
                    </div>
                </template>

                <!-- REQUIRED: name + assignee + due + pay gate -->
                <template v-else>
                    <mfp-input
                        label="Chore name"
                        name="reqTitle"
                        placeholder="Make your bed"
                        :value.prop="title"
                        @input="
                            title = ($event.target as HTMLInputElement).value
                        "
                    />
                    <div class="row">
                        <mfp-input
                            class="emoji-in"
                            label="Icon"
                            name="reqEmoji"
                            :value.prop="emoji"
                            @input="
                                emoji = ($event.target as HTMLInputElement)
                                    .value
                            "
                        />
                        <label class="field grow-field">
                            <span class="field-label">Assign to</span>
                            <select v-model="assignedKid" class="select">
                                <option value="" disabled>Pick a kid…</option>
                                <option
                                    v-for="k in kids"
                                    :key="k.id"
                                    :value="k.id"
                                >
                                    {{ k.display_name }}
                                </option>
                            </select>
                        </label>
                    </div>
                    <label class="field">
                        <span class="field-label">Due</span>
                        <select v-model="dueType" class="select">
                            <option value="end_of_day">End of day</option>
                            <option value="end_of_week">End of week</option>
                        </select>
                    </label>
                    <label class="check-field">
                        <input v-model="gatesPay" type="checkbox" />
                        <span
                            >Gates pay — if missed, holds this week's earnings
                            for review</span
                        >
                    </label>
                    <p v-if="!kids.length" class="muted small">
                        Add a kid on the Family page first — required chores are
                        assigned to a specific kid.
                    </p>
                </template>

                <mfp-button
                    type="submit"
                    variant="primary"
                    :disabled="creating || !title"
                >
                    {{ creating ? 'Adding…' : 'Add chore' }}
                </mfp-button>
            </form>
        </section>

        <p v-if="loading" class="muted">Loading…</p>

        <!-- Templates -->
        <section v-if="!loading" class="card">
            <h2>Your chores</h2>
            <p v-if="!templates.length" class="muted">
                No chores yet — create your first one above.
            </p>
            <ul v-else class="list">
                <li v-for="c in templates" :key="c.id" class="item">
                    <span class="icon">{{ c.icon_emoji || '📋' }}</span>
                    <span class="grow">
                        <strong>{{ c.title }}</strong>
                        <span v-if="c.chore_type === 'paid'" class="xp"
                            >{{ c.value_cents }} XP</span
                        >
                        <span v-else class="req-sub">
                            Required · for {{ kidName(c.assigned_kid_id)
                            }}<template v-if="c.gates_pay">
                                · 🔒 gates pay</template
                            >
                        </span>
                    </span>
                    <mfp-button
                        variant="secondary"
                        :disabled="busyId === c.id"
                        @click="addToPool(c.id)"
                    >
                        {{ c.chore_type === 'paid' ? 'Add to pool' : 'Assign' }}
                    </mfp-button>
                </li>
            </ul>
        </section>

        <!-- Live instances -->
        <section v-if="!loading" class="card">
            <h2>Live chores</h2>
            <p v-if="!pool.length" class="muted">
                Nothing live yet. Add a paid chore to the pool, or assign a
                required one.
            </p>
            <ul v-else class="list">
                <li v-for="i in pool" :key="i.id" class="live-item">
                    <div class="item">
                        <span class="icon">{{
                            i.chores?.icon_emoji || '📋'
                        }}</span>
                        <span class="grow">
                            <strong>{{ i.chores?.title || 'Chore' }}</strong>
                            <span
                                v-if="i.chores?.chore_type === 'required'"
                                class="req-sub"
                            >
                                for {{ kidName(i.assigned_to) }}
                            </span>
                            <span v-else class="xp"
                                >{{ i.value_cents_snapshot }} XP</span
                            >
                        </span>
                        <span class="badge" :class="`s-${i.state}`">
                            {{ STATE_LABEL[i.state] || i.state }}
                        </span>

                        <!-- Paid: approve / release -->
                        <template v-if="i.chores?.chore_type !== 'required'">
                            <mfp-button
                                v-if="i.state === 'SUBMITTED'"
                                variant="primary"
                                :disabled="busyId === i.id"
                                @click="act(i.id, 'approve')"
                            >
                                Approve
                            </mfp-button>
                            <mfp-button
                                v-if="
                                    [
                                        'CLAIMED',
                                        'IN_PROGRESS',
                                        'SUBMITTED',
                                    ].includes(i.state)
                                "
                                variant="ghost"
                                :disabled="busyId === i.id"
                                @click="act(i.id, 'release')"
                            >
                                {{
                                    i.state === 'SUBMITTED'
                                        ? 'Send back'
                                        : 'Release'
                                }}
                            </mfp-button>
                        </template>

                        <!-- Required: confirm -->
                        <mfp-button
                            v-else-if="i.state === 'SUBMITTED'"
                            variant="primary"
                            :disabled="busyId === i.id"
                            @click="act(i.id, 'confirm')"
                        >
                            Confirm
                        </mfp-button>

                        <button
                            class="notes-toggle"
                            :aria-label="'Notes'"
                            @click="
                                openNotes = openNotes === i.id ? null : i.id
                            "
                        >
                            💬
                        </button>
                    </div>

                    <NoteThread
                        v-if="openNotes === i.id"
                        :instance-id="i.id"
                        :subject-kid-id="i.claimed_by ?? i.assigned_to"
                    />
                </li>
            </ul>
        </section>
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
.muted {
    color: var(--color-text-muted);
}
.small {
    font-size: 0.8rem;
}
.card {
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-surface-muted, #eee);
    border-radius: var(--radius-lg, 1rem);
    padding: 1rem;
    margin-bottom: 1.25rem;
}
.tabs {
    display: flex;
    gap: 0.5rem;
    margin: 0 0 1rem;
}
.tab {
    flex: 1;
    padding: 0.5rem;
    border: 2px solid var(--color-surface-muted, #e6e0f5);
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface, #fff);
    color: var(--color-text-muted);
    font-family: var(--font-family-sans);
    font-weight: 700;
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
    gap: 0.75rem;
}
.row {
    display: flex;
    gap: 0.75rem;
}
.field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
}
.grow-field {
    flex: 1;
}
.field-label {
    font-weight: 700;
    font-size: 0.9rem;
}
.select {
    padding: 0.6rem 0.5rem;
    border: 2px solid var(--color-surface-muted, #e6e0f5);
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface, #fff);
    font: inherit;
    color: var(--color-text-default);
}
.check-field {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.9rem;
    line-height: 1.3;
}
.check-field input {
    margin-top: 0.15rem;
}
.chosen {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-brand-subtle, #efe7ff);
}
.chosen-emoji {
    font-size: 1.5rem;
}
.emoji-in {
    width: 5rem;
    flex: none;
}
.xp-in {
    flex: 1;
}
.list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.live-item {
    display: flex;
    flex-direction: column;
}
.item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface-muted, #f5f3f7);
}
.notes-toggle {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 1.1rem;
    padding: 0.2rem;
    line-height: 1;
}
.icon {
    font-size: 1.5rem;
}
.grow {
    flex: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}
.xp {
    font-size: 0.85rem;
    color: var(--color-brand-primary, #6c4ce0);
    font-weight: 700;
}
.req-sub {
    font-size: 0.8rem;
    color: var(--color-text-muted);
}
.badge {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: #e6e0f5;
    color: #4a3aa8;
    white-space: nowrap;
}
.s-OPEN {
    background: #d8ecff;
    color: #1c5fa8;
}
.s-CLAIMED {
    background: #fff0cc;
    color: #8a6400;
}
.s-IN_PROGRESS {
    background: #efe0ff;
    color: #6b2fb3;
}
.s-SUBMITTED {
    background: #ffe2cc;
    color: #a5510a;
}
.s-APPROVED,
.s-CONFIRMED {
    background: #d6f5d6;
    color: #1f7a34;
}
.s-ASSIGNED {
    background: #e6e0f5;
    color: #4a3aa8;
}
.s-MISSED {
    background: #ffd6d6;
    color: #b3261e;
}
</style>
