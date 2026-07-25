<script setup lang="ts">
// The kid's Quest Board (SPEC §2 paid flow, kid side): claim an OPEN chore, then
// start → submit the ones you've claimed. Timers are SERVER-authoritative stored
// deadlines — we only render `deadline − now`, ticking a local clock each second.
// The pool is polled every few seconds so a sibling's claim shows up (realtime
// sync is build step 7).
const supabase = useSupabaseClient();
const { authFetch } = useApi();

interface Instance {
    id: string;
    state: string;
    value_cents_snapshot: number;
    claimed_by: string | null;
    assigned_to: string | null;
    start_deadline: string | null;
    finish_deadline: string | null;
    due_date: string | null;
    chores: {
        title: string;
        icon_emoji: string | null;
        chore_type: string;
    } | null;
}

// One earned/spent/adjusted XP event (SPEC §4 ledger). RLS scopes it to this kid.
interface LedgerRow {
    delta_cents: number;
    reason: string;
    note: string | null;
    created_at: string;
    chore_instances: {
        chores: { title: string; icon_emoji: string | null } | null;
    } | null;
}

const REASON_LABEL: Record<string, string> = {
    chore_approved: 'Chore approved',
    parent_adjustment: 'From a grown-up',
    goal_allocation: 'Toward a quest',
    payout: 'Cashed out',
};

const uid = ref<string | null>(null);
const pool = ref<Instance[]>([]);
const myXp = ref(0);
const history = ref<LedgerRow[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const busyId = ref<string | null>(null);
// Local clock for countdowns; updated every second.
const now = ref<number>(0);

let clock: ReturnType<typeof setInterval> | null = null;
let poller: ReturnType<typeof setInterval> | null = null;

// OPEN paid chores anyone in the household can grab.
const upForGrabs = computed(() =>
    pool.value.filter(
        (i) => i.state === 'OPEN' && i.chores?.chore_type === 'paid',
    ),
);
// This kid's active claims (things they still have to act on).
const myQuests = computed(() =>
    pool.value.filter(
        (i) =>
            i.claimed_by === uid.value &&
            ['CLAIMED', 'IN_PROGRESS', 'SUBMITTED'].includes(i.state),
    ),
);
// This kid's approved chores (the trophy shelf).
const myDone = computed(() =>
    pool.value.filter(
        (i) => i.claimed_by === uid.value && i.state === 'APPROVED',
    ),
);
// Required chores assigned to this kid that still need attention or just resolved.
const myRequired = computed(() =>
    pool.value.filter(
        (i) =>
            i.chores?.chore_type === 'required' &&
            i.assigned_to === uid.value &&
            ['ASSIGNED', 'SUBMITTED', 'MISSED'].includes(i.state),
    ),
);

function dueLabel(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay ? 'Due today' : `Due ${d.toLocaleDateString()}`;
}

function apiMessage(e: unknown): string {
    const err = e as { data?: { message?: string }; message?: string };
    return err?.data?.message || err?.message || 'Something went wrong';
}

// deadline − now, formatted. > 1h shows "1h 23m", under shows "12:34" (mm:ss).
function remaining(deadline: string | null): { text: string; over: boolean } {
    if (!deadline) return { text: '', over: false };
    const ms = new Date(deadline).getTime() - now.value;
    if (ms <= 0) return { text: "Time's up!", over: true };
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return { text: `${h}h ${m}m left`, over: false };
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return { text: `${mm}:${ss} left`, over: false };
}

async function loadPool(silent = false) {
    if (!silent) loading.value = true;
    try {
        pool.value = await authFetch<Instance[]>('/chore-instances');
        if (!silent) error.value = null;
    } catch (e) {
        if (!silent) error.value = apiMessage(e);
    }
    if (!silent) loading.value = false;
}

// XP balance = sum of this kid's ledger deltas (RLS returns only their rows).
async function loadXp() {
    const { data } = await supabase
        .from('ledger_entries')
        .select(
            'delta_cents, reason, note, created_at, chore_instances(chores(title, icon_emoji))',
        )
        .order('created_at', { ascending: false });
    const rows = (data ?? []) as unknown as LedgerRow[];
    history.value = rows;
    myXp.value = rows.reduce((sum, r) => sum + r.delta_cents, 0);
}

async function act(
    id: string,
    action: 'claim' | 'start' | 'submit' | 'mark-done',
) {
    error.value = null;
    busyId.value = id;
    try {
        await authFetch(`/chore-instances/${id}/${action}`, { method: 'POST' });
        await loadPool(true);
    } catch (e) {
        error.value = apiMessage(e);
        await loadPool(true); // resync — someone may have beaten us to it
    }
    busyId.value = null;
}

onMounted(async () => {
    const { data, error: err } = await supabase.auth.getUser();
    if (err || !data.user) {
        navigateTo('/login');
        return;
    }
    uid.value = data.user.id;
    now.value = Date.now();
    await Promise.all([loadPool(), loadXp()]);
    clock = setInterval(() => {
        now.value = Date.now();
    }, 1000);
    // Re-poll the pool AND the XP total, so an approval by a parent shows up
    // (both the chore moving to Done and the XP going up).
    poller = setInterval(() => {
        void loadPool(true);
        void loadXp();
    }, 5000);
});

onUnmounted(() => {
    if (clock) clearInterval(clock);
    if (poller) clearInterval(poller);
});
</script>

<template>
    <main class="wrap">
        <p class="back"><NuxtLink to="/dashboard">← Home</NuxtLink></p>
        <h1>🗺️ Quest Board</h1>

        <!-- XP balance hero -->
        <div class="xp-hero">
            <span class="xp-star">⭐</span>
            <span class="xp-total">{{ myXp }}</span>
            <span class="xp-word">XP</span>
        </div>

        <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
        <p v-if="loading" class="muted">Loading…</p>

        <!-- Required chores assigned to me -->
        <section v-if="!loading && myRequired.length" class="card">
            <h2>📋 My chores</h2>
            <ul class="list">
                <li
                    v-for="i in myRequired"
                    :key="i.id"
                    class="item"
                    :class="{ done: i.state === 'MISSED' }"
                >
                    <span class="icon">{{ i.chores?.icon_emoji || '📋' }}</span>
                    <span class="grow">
                        <strong>{{ i.chores?.title || 'Chore' }}</strong>
                        <span
                            v-if="i.state === 'ASSIGNED'"
                            class="timer"
                            :class="{
                                over:
                                    !!i.due_date &&
                                    new Date(i.due_date).getTime() < now,
                            }"
                        >
                            ⏰ {{ dueLabel(i.due_date) }}
                        </span>
                        <span
                            v-else-if="i.state === 'SUBMITTED'"
                            class="pending"
                        >
                            ✅ Done — waiting for a grown-up
                        </span>
                        <span v-else class="missed-tag">😬 Missed</span>
                    </span>
                    <mfp-button
                        v-if="i.state === 'ASSIGNED'"
                        variant="primary"
                        :disabled="busyId === i.id"
                        @click="act(i.id, 'mark-done')"
                    >
                        Mark done
                    </mfp-button>
                </li>
            </ul>
        </section>

        <!-- My active quests -->
        <section v-if="!loading && myQuests.length" class="card">
            <h2>⚡ My quests</h2>
            <ul class="list">
                <li v-for="i in myQuests" :key="i.id" class="item">
                    <span class="icon">{{ i.chores?.icon_emoji || '📋' }}</span>
                    <span class="grow">
                        <strong>{{ i.chores?.title || 'Chore' }}</strong>
                        <span class="xp">{{ i.value_cents_snapshot }} XP</span>
                        <span
                            v-if="i.state === 'CLAIMED' && i.start_deadline"
                            class="timer"
                            :class="{ over: remaining(i.start_deadline).over }"
                        >
                            ⏳ Start it: {{ remaining(i.start_deadline).text }}
                        </span>
                        <span
                            v-else-if="
                                i.state === 'IN_PROGRESS' && i.finish_deadline
                            "
                            class="timer"
                            :class="{ over: remaining(i.finish_deadline).over }"
                        >
                            ⏱️ Finish it:
                            {{ remaining(i.finish_deadline).text }}
                        </span>
                        <span
                            v-else-if="i.state === 'SUBMITTED'"
                            class="pending"
                        >
                            ✅ Turned in — waiting for a grown-up
                        </span>
                    </span>
                    <mfp-button
                        v-if="i.state === 'CLAIMED'"
                        variant="primary"
                        :disabled="busyId === i.id"
                        @click="act(i.id, 'start')"
                    >
                        Start
                    </mfp-button>
                    <mfp-button
                        v-else-if="i.state === 'IN_PROGRESS'"
                        variant="primary"
                        :disabled="busyId === i.id"
                        @click="act(i.id, 'submit')"
                    >
                        Turn in
                    </mfp-button>
                </li>
            </ul>
        </section>

        <!-- Up for grabs -->
        <section v-if="!loading" class="card">
            <h2>🏁 Up for grabs</h2>
            <p v-if="!upForGrabs.length" class="muted">
                Nothing to claim right now. Check back soon!
            </p>
            <ul v-else class="list">
                <li v-for="i in upForGrabs" :key="i.id" class="item">
                    <span class="icon">{{ i.chores?.icon_emoji || '📋' }}</span>
                    <span class="grow">
                        <strong>{{ i.chores?.title || 'Chore' }}</strong>
                        <span class="xp">{{ i.value_cents_snapshot }} XP</span>
                    </span>
                    <mfp-button
                        variant="primary"
                        :disabled="busyId === i.id"
                        @click="act(i.id, 'claim')"
                    >
                        Claim!
                    </mfp-button>
                </li>
            </ul>
        </section>

        <!-- Trophy shelf -->
        <section v-if="!loading && myDone.length" class="card">
            <h2>🏆 Done</h2>
            <ul class="list">
                <li v-for="i in myDone" :key="i.id" class="item done">
                    <span class="icon">{{ i.chores?.icon_emoji || '📋' }}</span>
                    <span class="grow">
                        <strong>{{ i.chores?.title || 'Chore' }}</strong>
                        <span class="xp">+{{ i.value_cents_snapshot }} XP</span>
                    </span>
                    <span class="check">✓</span>
                </li>
            </ul>
        </section>

        <!-- XP history -->
        <section v-if="!loading && history.length" class="card">
            <h2>📜 XP history</h2>
            <ul class="list">
                <li v-for="(h, idx) in history" :key="idx" class="item ledger">
                    <span class="icon">{{
                        h.chore_instances?.chores?.icon_emoji ||
                        (h.delta_cents >= 0 ? '✨' : '💸')
                    }}</span>
                    <span class="grow">
                        <strong>{{
                            h.chore_instances?.chores?.title ||
                            REASON_LABEL[h.reason] ||
                            'XP'
                        }}</strong>
                        <span class="ledger-date">{{
                            new Date(h.created_at).toLocaleDateString()
                        }}</span>
                    </span>
                    <span
                        class="delta"
                        :class="h.delta_cents >= 0 ? 'pos' : 'neg'"
                    >
                        {{ h.delta_cents >= 0 ? '+' : ''
                        }}{{ h.delta_cents }} XP
                    </span>
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
.xp-hero {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.4rem;
    margin: 0.5rem 0 1.25rem;
    padding: 1rem;
    border-radius: var(--radius-lg, 1rem);
    background: var(--color-brand-subtle, #efe7ff);
}
.xp-star {
    font-size: 1.8rem;
}
.xp-total {
    font-family: 'Baloo 2', var(--font-family-sans);
    font-size: 2.75rem;
    font-weight: 800;
    line-height: 1;
    color: var(--color-brand-primary, #6c4ce0);
}
.xp-word {
    font-weight: 800;
    color: var(--color-brand-primary, #6c4ce0);
}
.ledger .ledger-date {
    font-size: 0.75rem;
    color: var(--color-text-muted);
}
.delta {
    font-size: 0.9rem;
    font-weight: 800;
    white-space: nowrap;
}
.delta.pos {
    color: #1f7a34;
}
.delta.neg {
    color: #b3261e;
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
.card {
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-surface-muted, #eee);
    border-radius: var(--radius-lg, 1rem);
    padding: 1rem;
    margin-bottom: 1.25rem;
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
    padding: 0.6rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface-muted, #f5f3f7);
}
.item.done {
    opacity: 0.75;
}
.icon {
    font-size: 1.6rem;
}
.grow {
    flex: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
    gap: 0.1rem;
}
.xp {
    font-size: 0.85rem;
    color: var(--color-brand-primary, #6c4ce0);
    font-weight: 700;
}
.timer {
    font-size: 0.8rem;
    font-weight: 700;
    color: #8a6400;
}
.timer.over {
    color: #b3261e;
}
.pending {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    font-weight: 700;
}
.missed-tag {
    font-size: 0.8rem;
    color: #b3261e;
    font-weight: 700;
}
.check {
    font-size: 1.3rem;
    color: #1f7a34;
    font-weight: 800;
}
</style>
