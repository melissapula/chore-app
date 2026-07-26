<script setup lang="ts">
// The kid's home dashboard: a level/XP hero + three tabs.
//   • Main Quest  — required chores assigned to them (SPEC §3a).
//   • Side Quest  — chores up for grabs + the ones they've accepted (SPEC §2),
//                   plus the "earn toward a goal" planner (SPEC §5).
//   • Guild Quest — the family goal's progress + per-kid contribution chart (§4d).
// Live via Supabase Realtime; a slow poll is only a fallback.
import type { RealtimeChannel } from '@supabase/supabase-js';

const props = defineProps<{ uid: string }>();

const supabase = useSupabaseClient();
const { authFetch } = useApi();

interface Instance {
    id: string;
    state: string;
    value_cents_snapshot: number;
    claimed_by: string | null;
    assigned_to: string | null;
    gates_pay: boolean;
    start_deadline: string | null;
    finish_deadline: string | null;
    due_date: string | null;
    chores: {
        title: string;
        icon_emoji: string | null;
        chore_type: string;
        est_minutes: number | null;
        category: string | null;
    } | null;
}
interface LedgerRow {
    delta_cents: number;
    reason: string;
    note: string | null;
    created_at: string;
    chore_instances: {
        chores: { title: string; icon_emoji: string | null } | null;
    } | null;
}
interface Contribution {
    kid_id: string;
    display_name: string;
    xp: number;
}
interface GuildView {
    quest: {
        id: string;
        title: string;
        reward: string | null;
        target_xp: number;
    } | null;
    progress: number;
    contributions: Contribution[];
}

const REASON_LABEL: Record<string, string> = {
    chore_approved: 'Chore approved',
    parent_adjustment: 'From a grown-up',
    goal_allocation: 'Toward a quest',
    quest_redeemed: 'Quest redeemed',
    payout: 'Cashed out',
};

const tab = ref<'main' | 'side' | 'guild'>('main');
const pool = ref<Instance[]>([]);
const myXp = ref(0);
const history = ref<LedgerRow[]>([]);
const guild = ref<GuildView | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const busyId = ref<string | null>(null);
const openNotes = ref<string | null>(null);
const now = ref<number>(0);

let clock: ReturnType<typeof setInterval> | null = null;
let poller: ReturnType<typeof setInterval> | null = null;
let channel: RealtimeChannel | null = null;

// --- derived chore lists ---
const upForGrabs = computed(() =>
    pool.value.filter(
        (i) => i.state === 'OPEN' && i.chores?.chore_type === 'paid',
    ),
);
const accepted = computed(() =>
    pool.value.filter(
        (i) =>
            i.claimed_by === props.uid &&
            ['CLAIMED', 'IN_PROGRESS', 'SUBMITTED'].includes(i.state),
    ),
);
const myDone = computed(() =>
    pool.value.filter(
        (i) => i.claimed_by === props.uid && i.state === 'APPROVED',
    ),
);
const myRequired = computed(() =>
    pool.value.filter(
        (i) =>
            i.chores?.chore_type === 'required' &&
            i.assigned_to === props.uid &&
            ['ASSIGNED', 'SUBMITTED', 'MISSED'].includes(i.state),
    ),
);
const lifetime = computed(() =>
    history.value
        .filter((r) => r.delta_cents > 0)
        .reduce((s, r) => s + r.delta_cents, 0),
);
const lvl = computed(() => levelInfo(lifetime.value));
const gating = computed(() => {
    const mine = pool.value.filter(
        (i) =>
            i.chores?.chore_type === 'required' &&
            i.assigned_to === props.uid &&
            i.gates_pay,
    );
    return {
        total: mine.length,
        done: mine.filter((i) => i.state === 'CONFIRMED').length,
    };
});

// --- guild chart helpers ---
const guildPct = computed(() => {
    const q = guild.value?.quest;
    if (!q) return 0;
    return Math.min(
        100,
        Math.round((guild.value!.progress / q.target_xp) * 100),
    );
});
function guildWidth(xp: number): number {
    const q = guild.value?.quest;
    return q ? (xp / q.target_xp) * 100 : 0;
}
function seg(i: number): string {
    return `var(--s${(i % 8) + 1})`;
}

function dueLabel(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? 'Due today' : `Due ${d.toLocaleDateString()}`;
}
function remaining(deadline: string | null): { text: string; over: boolean } {
    if (!deadline) return { text: '', over: false };
    const ms = new Date(deadline).getTime() - now.value;
    if (ms <= 0) return { text: "Time's up!", over: true };
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return { text: `${h}h ${m}m left`, over: false };
    return {
        text: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} left`,
        over: false,
    };
}
function apiMessage(e: unknown): string {
    const err = e as { data?: { message?: string }; message?: string };
    return err?.data?.message || err?.message || 'Something went wrong';
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
async function loadGuild() {
    try {
        guild.value = await authFetch<GuildView>('/guild');
    } catch {
        guild.value = null;
    }
}

// --- planner (SPEC §5) ---
const planTarget = ref<number | null>(null);
const plan = ref<BundlePlan | null>(null);
const planBusy = ref<string | null>(null);
const planTargetDisplay = computed(() =>
    planTarget.value === null ? '' : String(planTarget.value),
);
function makePlan() {
    error.value = null;
    if (!planTarget.value || planTarget.value <= 0) {
        error.value = 'Enter an XP goal to plan for.';
        return;
    }
    const items: BundleItem[] = upForGrabs.value.map((i) => ({
        id: i.id,
        title: i.chores?.title ?? 'Chore',
        icon: i.chores?.icon_emoji ?? null,
        xp: i.value_cents_snapshot,
        minutes: i.chores?.est_minutes ?? 0,
        category: i.chores?.category ?? null,
    }));
    plan.value = makeBundles(items, planTarget.value);
}
async function claimPlan(bundle: Bundle) {
    error.value = null;
    planBusy.value = bundle.key;
    for (const item of bundle.items) {
        try {
            await authFetch(`/chore-instances/${item.id}/claim`, {
                method: 'POST',
            });
        } catch {
            /* a sibling may have grabbed it — keep going */
        }
    }
    planBusy.value = null;
    plan.value = null;
    planTarget.value = null;
    await loadPool(true);
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
        await loadPool(true);
    }
    busyId.value = null;
}

onMounted(async () => {
    now.value = Date.now();
    await Promise.all([loadPool(), loadXp(), loadGuild()]);
    clock = setInterval(() => {
        now.value = Date.now();
    }, 1000);
    channel = supabase
        .channel('kid-dashboard')
        .on(
            'postgres_changes',
            { event: '*', schema: 'chore', table: 'chore_instances' },
            () => void loadPool(true),
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'chore', table: 'ledger_entries' },
            () => {
                void loadXp();
                void loadGuild();
            },
        )
        .subscribe();
    poller = setInterval(() => {
        void loadPool(true);
        void loadXp();
        void loadGuild();
    }, 30000);
});
onUnmounted(() => {
    if (clock) clearInterval(clock);
    if (poller) clearInterval(poller);
    if (channel) void supabase.removeChannel(channel);
});
</script>

<template>
    <div class="kid">
        <!-- XP + level hero -->
        <div class="xp-hero viz-root">
            <div class="xp-main">
                <span class="xp-star">⭐</span>
                <span class="xp-total">{{ myXp }}</span>
                <span class="xp-word">XP</span>
                <NuxtLink to="/quests" class="quests-link">🎁 Rewards</NuxtLink>
            </div>
            <div class="lvl-row">
                <span class="lvl-badge">Lv {{ lvl.level }}</span>
                <div class="lvl-bar">
                    <div class="lvl-fill" :style="{ width: lvl.pct + '%' }" />
                </div>
                <span class="lvl-next">{{ lvl.toNext }} to next</span>
            </div>
        </div>

        <!-- Tabs -->
        <div class="tabs" role="tablist">
            <button
                class="tab"
                :class="{ active: tab === 'main' }"
                role="tab"
                :aria-selected="tab === 'main'"
                @click="tab = 'main'"
            >
                ⚔️ Main Quest
            </button>
            <button
                class="tab"
                :class="{ active: tab === 'side' }"
                role="tab"
                :aria-selected="tab === 'side'"
                @click="tab = 'side'"
            >
                🗺️ Side Quest
            </button>
            <button
                class="tab"
                :class="{ active: tab === 'guild' }"
                role="tab"
                :aria-selected="tab === 'guild'"
                @click="tab = 'guild'"
            >
                🛡️ Guild
            </button>
        </div>

        <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
        <p v-if="loading" class="muted">Loading…</p>

        <!-- ===================== MAIN QUEST ===================== -->
        <section v-show="tab === 'main'" v-if="!loading" class="panel">
            <div
                v-if="gating.total > 0 && gating.done < gating.total"
                class="gate-nudge"
            >
                🔒 {{ gating.done }}/{{ gating.total }} required chores done —
                finish them to unlock this week's pay!
            </div>

            <p v-if="!myRequired.length" class="muted empty">
                No required chores right now. 🎉
            </p>
            <ul v-else class="list">
                <li v-for="i in myRequired" :key="i.id" class="live-item">
                    <div class="item" :class="{ done: i.state === 'MISSED' }">
                        <span class="icon">{{
                            i.chores?.icon_emoji || '📋'
                        }}</span>
                        <span class="grow">
                            <strong>{{ i.chores?.title || 'Chore' }}</strong>
                            <span
                                v-if="i.state === 'ASSIGNED'"
                                class="tag"
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
                            <span v-else class="missed">😬 Missed</span>
                        </span>
                        <mfp-button
                            v-if="i.state === 'ASSIGNED'"
                            variant="primary"
                            :disabled="busyId === i.id"
                            @click="act(i.id, 'mark-done')"
                        >
                            Mark done
                        </mfp-button>
                        <button
                            class="notes-toggle"
                            aria-label="Notes"
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
                        :subject-kid-id="props.uid"
                    />
                </li>
            </ul>
        </section>

        <!-- ===================== SIDE QUEST ===================== -->
        <section v-show="tab === 'side'" v-if="!loading" class="panel">
            <!-- Accepted -->
            <div v-if="accepted.length" class="block">
                <h3>⚡ Accepted</h3>
                <ul class="list">
                    <li v-for="i in accepted" :key="i.id" class="live-item">
                        <div class="item">
                            <span class="icon">{{
                                i.chores?.icon_emoji || '📋'
                            }}</span>
                            <span class="grow">
                                <strong>{{
                                    i.chores?.title || 'Chore'
                                }}</strong>
                                <span class="xp"
                                    >{{ i.value_cents_snapshot }} XP</span
                                >
                                <span
                                    v-if="
                                        i.state === 'CLAIMED' &&
                                        i.start_deadline
                                    "
                                    class="tag"
                                    :class="{
                                        over: remaining(i.start_deadline).over,
                                    }"
                                >
                                    ⏳ Start it:
                                    {{ remaining(i.start_deadline).text }}
                                </span>
                                <span
                                    v-else-if="
                                        i.state === 'IN_PROGRESS' &&
                                        i.finish_deadline
                                    "
                                    class="tag"
                                    :class="{
                                        over: remaining(i.finish_deadline).over,
                                    }"
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
                            <button
                                class="notes-toggle"
                                aria-label="Notes"
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
                            :subject-kid-id="props.uid"
                        />
                    </li>
                </ul>
            </div>

            <!-- Up for grabs -->
            <div class="block">
                <h3>🏁 Up for grabs</h3>
                <p v-if="!upForGrabs.length" class="muted">
                    Nothing to claim right now. Check back soon!
                </p>
                <ul v-else class="list">
                    <li v-for="i in upForGrabs" :key="i.id" class="item">
                        <span class="icon">{{
                            i.chores?.icon_emoji || '📋'
                        }}</span>
                        <span class="grow">
                            <strong>{{ i.chores?.title || 'Chore' }}</strong>
                            <span class="xp"
                                >{{ i.value_cents_snapshot }} XP</span
                            >
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
            </div>

            <!-- Planner -->
            <div v-if="upForGrabs.length" class="block">
                <h3>💡 Earn toward a goal</h3>
                <form class="plan-form" @submit.prevent="makePlan">
                    <mfp-input
                        class="plan-in"
                        label="I want to earn…"
                        name="planTarget"
                        type="number"
                        inputmode="numeric"
                        placeholder="200"
                        :value.prop="planTargetDisplay"
                        @input="
                            planTarget =
                                Number(
                                    ($event.target as HTMLInputElement).value,
                                ) || null
                        "
                    />
                    <mfp-button type="submit" variant="secondary"
                        >Plan it</mfp-button
                    >
                </form>
                <p
                    v-if="plan && plan.totalAvailable < plan.target"
                    class="muted small"
                >
                    Only {{ plan.totalAvailable }} XP is up for grabs right now.
                </p>
                <div v-if="plan" class="plans">
                    <div
                        v-for="b in plan.bundles"
                        :key="b.key"
                        class="plan-card"
                    >
                        <div class="plan-head">
                            <strong>{{ b.label }}</strong>
                            <span class="muted small">{{ b.hint }}</span>
                        </div>
                        <ul class="plan-items">
                            <li v-for="it in b.items" :key="it.id">
                                <span
                                    >{{ it.icon || '📋' }} {{ it.title }}</span
                                >
                                <span class="xp">{{ it.xp }} XP</span>
                            </li>
                        </ul>
                        <div class="plan-foot">
                            <strong>{{ b.totalXp }} XP</strong>
                            <mfp-button
                                variant="primary"
                                :disabled="planBusy !== null"
                                @click="claimPlan(b)"
                            >
                                {{
                                    planBusy === b.key
                                        ? 'Claiming…'
                                        : `Claim these ${b.items.length}`
                                }}
                            </mfp-button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Done -->
            <div v-if="myDone.length" class="block">
                <h3>🏆 Done</h3>
                <ul class="list">
                    <li v-for="i in myDone" :key="i.id" class="item faded">
                        <span class="icon">{{
                            i.chores?.icon_emoji || '📋'
                        }}</span>
                        <span class="grow">
                            <strong>{{ i.chores?.title || 'Chore' }}</strong>
                            <span class="xp"
                                >+{{ i.value_cents_snapshot }} XP</span
                            >
                        </span>
                        <span class="check">✓</span>
                    </li>
                </ul>
            </div>

            <!-- XP history -->
            <div v-if="history.length" class="block">
                <h3>📜 XP history</h3>
                <ul class="list">
                    <li v-for="(h, idx) in history" :key="idx" class="item">
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
                            <span class="small muted">{{
                                new Date(h.created_at).toLocaleDateString()
                            }}</span>
                        </span>
                        <span
                            class="delta"
                            :class="h.delta_cents >= 0 ? 'pos' : 'neg'"
                            >{{ h.delta_cents >= 0 ? '+' : ''
                            }}{{ h.delta_cents }} XP</span
                        >
                    </li>
                </ul>
            </div>
        </section>

        <!-- ===================== GUILD QUEST ===================== -->
        <section
            v-show="tab === 'guild'"
            v-if="!loading"
            class="panel viz-root"
        >
            <template v-if="guild?.quest">
                <div class="g-head">
                    <strong class="g-title">{{ guild.quest.title }}</strong>
                    <span v-if="guildPct >= 100" class="reached"
                        >🎉 Reached!</span
                    >
                </div>
                <p class="figure">
                    <strong>{{ guild.progress.toLocaleString() }}</strong>
                    <span class="of"
                        >/ {{ guild.quest.target_xp.toLocaleString() }} XP</span
                    >
                    <span class="pct">{{ guildPct }}%</span>
                </p>
                <div class="bar">
                    <div
                        v-for="(c, i) in guild.contributions"
                        v-show="c.xp > 0"
                        :key="c.kid_id"
                        class="segbar"
                        :style="{
                            width: guildWidth(c.xp) + '%',
                            background: seg(i),
                        }"
                    />
                </div>
                <ul class="legend">
                    <li v-for="(c, i) in guild.contributions" :key="c.kid_id">
                        <span class="swatch" :style="{ background: seg(i) }" />
                        <span class="grow">{{ c.display_name }}</span>
                        <span class="amt">{{ c.xp.toLocaleString() }} XP</span>
                    </li>
                </ul>
            </template>
            <p v-else class="muted empty">
                No guild quest right now — ask a grown-up to start one, then
                everyone's XP helps reach it together!
            </p>
        </section>
    </div>
</template>

<style scoped>
/* dataviz categorical palette for the guild chart (light + dark). */
.viz-root {
    --s1: #2a78d6;
    --s2: #eb6834;
    --s3: #1baf7a;
    --s4: #eda100;
    --s5: #e87ba4;
    --s6: #008300;
    --s7: #4a3aa7;
    --s8: #e34948;
    --track: #f0edf7;
}
@media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme='light'])) .viz-root {
        --s1: #3987e5;
        --s2: #d95926;
        --s3: #199e70;
        --s4: #c98500;
        --s5: #d55181;
        --s6: #008300;
        --s7: #9085e9;
        --s8: #e66767;
        --track: #2c2c2a;
    }
}
:root[data-theme='dark'] .viz-root {
    --s1: #3987e5;
    --s2: #d95926;
    --s3: #199e70;
    --s4: #c98500;
    --s5: #d55181;
    --s6: #008300;
    --s7: #9085e9;
    --s8: #e66767;
    --track: #2c2c2a;
}
.muted {
    color: var(--color-text-muted);
}
.small {
    font-size: 0.8rem;
}
.empty {
    padding: 1rem 0;
}
/* hero */
.xp-hero {
    margin: 0.5rem 0 1rem;
    padding: 1rem;
    border-radius: var(--radius-lg, 1rem);
    background: var(--color-brand-subtle, #efe7ff);
}
.xp-main {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
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
.quests-link {
    margin-left: auto;
    align-self: center;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-brand-primary, #6c4ce0);
    text-decoration: none;
    background: #fff;
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
}
.lvl-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.75rem;
}
.lvl-badge {
    font-family: 'Baloo 2', var(--font-family-sans);
    font-weight: 800;
    color: var(--color-brand-primary, #6c4ce0);
    white-space: nowrap;
}
.lvl-bar {
    flex: 1;
    height: 0.55rem;
    border-radius: 999px;
    background: #fff;
    overflow: hidden;
}
.lvl-fill {
    height: 100%;
    background: var(--color-brand-primary, #6c4ce0);
}
.lvl-next {
    font-size: 0.72rem;
    color: var(--color-text-muted);
    white-space: nowrap;
}
/* tabs */
.tabs {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 1rem;
}
.tab {
    flex: 1;
    padding: 0.55rem 0.4rem;
    border: 2px solid var(--color-surface-muted, #e6e0f5);
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface, #fff);
    color: var(--color-text-muted);
    font-family: var(--font-family-sans);
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
}
.tab.active {
    border-color: var(--color-brand-primary, #6c4ce0);
    background: var(--color-brand-subtle, #efe7ff);
    color: var(--color-brand-primary, #6c4ce0);
}
.panel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}
.block h3 {
    font-family: 'Baloo 2', var(--font-family-sans);
    font-size: 1rem;
    margin: 0 0 0.5rem;
}
/* lists */
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
    padding: 0.6rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface-muted, #f5f3f7);
}
.item.faded {
    opacity: 0.75;
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
.tag {
    font-size: 0.8rem;
    font-weight: 700;
    color: #8a6400;
}
.tag.over {
    color: #b3261e;
}
.pending {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    font-weight: 700;
}
.missed {
    font-size: 0.8rem;
    color: #b3261e;
    font-weight: 700;
}
.check {
    font-size: 1.3rem;
    color: #1f7a34;
    font-weight: 800;
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
.gate-nudge {
    padding: 0.75rem 1rem;
    border-radius: var(--radius-md, 0.75rem);
    background: #fff0cc;
    color: #8a6400;
    font-weight: 700;
    font-size: 0.9rem;
}
/* planner */
.plan-form {
    display: flex;
    gap: 0.6rem;
    align-items: flex-end;
}
.plan-in {
    flex: 1;
}
.plans {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.75rem;
}
.plan-card {
    border: 1px solid var(--color-surface-muted, #e6e0f5);
    border-radius: var(--radius-md, 0.75rem);
    padding: 0.75rem;
}
.plan-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
}
.plan-items {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}
.plan-items li {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.9rem;
}
.plan-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    border-top: 1px solid var(--color-surface-muted, #f0edf7);
    padding-top: 0.5rem;
}
/* guild chart */
.g-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
}
.g-title {
    font-family: 'Baloo 2', var(--font-family-sans);
    font-size: 1.15rem;
}
.reached {
    font-weight: 800;
    color: #1f7a34;
}
.figure {
    margin: 0.5rem 0;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
}
.figure strong {
    font-size: 2rem;
    font-family: 'Baloo 2', var(--font-family-sans);
    color: var(--color-brand-primary, #6c4ce0);
    font-variant-numeric: tabular-nums;
}
.of {
    color: var(--color-text-muted);
}
.pct {
    margin-left: auto;
    font-weight: 800;
    color: var(--color-brand-primary, #6c4ce0);
}
.bar {
    display: flex;
    gap: 2px;
    height: 1.4rem;
    border-radius: 999px;
    background: var(--track);
    overflow: hidden;
    margin-bottom: 0.75rem;
}
.segbar {
    height: 100%;
    min-width: 3px;
}
.legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
}
.legend li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
}
.swatch {
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 0.25rem;
    flex: none;
}
.amt {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}
</style>
