<script setup lang="ts">
// Kid-facing quests (SPEC §4d): a lifetime Level bar, spendable XP, and personal
// reward quests you save up for. Progress = min(spendable, target). When you hit
// the target it's "Ready!" — a grown-up redeems it (writes the negative ledger
// entry) from the Family page. Parents are sent there instead of here.
const supabase = useSupabaseClient();

interface Quest {
    id: string;
    title: string;
    reward: string | null;
    target_xp: number;
    status: string;
    deadline: string | null;
}

const uid = ref<string | null>(null);
const householdId = ref<string | null>(null);
const spendable = ref(0);
const lifetime = ref(0);
const quests = ref<Quest[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const busyId = ref<string | null>(null);

// create form
const title = ref('');
const reward = ref('');
const target = ref<number | null>(null);
const deadline = ref('');
const creating = ref(false);

const targetDisplay = computed(() =>
    target.value === null ? '' : String(target.value),
);
const level = computed(() => levelInfo(lifetime.value));
const activeQuests = computed(() =>
    quests.value.filter((q) => q.status === 'active'),
);
const redeemedQuests = computed(() =>
    quests.value.filter((q) => q.status === 'redeemed'),
);

function progressPct(q: Quest): number {
    return Math.min(100, Math.round((spendable.value / q.target_xp) * 100));
}
function isReady(q: Quest): boolean {
    return spendable.value >= q.target_xp;
}

async function loadAll() {
    loading.value = true;
    error.value = null;
    const [ledRes, qRes] = await Promise.all([
        supabase.from('ledger_entries').select('delta_cents'),
        supabase
            .from('quests')
            .select('id, title, reward, target_xp, status, deadline')
            .eq('scope', 'personal')
            .order('created_at', { ascending: false }),
    ]);
    if (ledRes.error) error.value = ledRes.error.message;
    else {
        const rows = (ledRes.data ?? []) as { delta_cents: number }[];
        spendable.value = rows.reduce((s, r) => s + r.delta_cents, 0);
        lifetime.value = rows
            .filter((r) => r.delta_cents > 0)
            .reduce((s, r) => s + r.delta_cents, 0);
    }
    if (qRes.error) error.value = qRes.error.message;
    else quests.value = (qRes.data ?? []) as Quest[];
    loading.value = false;
}

async function createQuest() {
    error.value = null;
    if (!title.value.trim()) {
        error.value = 'Give your quest a name.';
        return;
    }
    if (!target.value || target.value <= 0) {
        error.value = 'Set an XP goal bigger than 0.';
        return;
    }
    if (!householdId.value) return;
    creating.value = true;
    const { error: err } = await supabase.from('quests').insert({
        household_id: householdId.value,
        kid_id: uid.value,
        scope: 'personal',
        title: title.value.trim(),
        reward: reward.value.trim() || null,
        target_xp: Math.round(target.value),
        deadline: deadline.value || null,
    });
    creating.value = false;
    if (err) {
        error.value = err.message;
        return;
    }
    title.value = '';
    reward.value = '';
    target.value = null;
    deadline.value = '';
    await loadAll();
}

async function removeQuest(id: string) {
    error.value = null;
    busyId.value = id;
    const { error: err } = await supabase.from('quests').delete().eq('id', id);
    busyId.value = null;
    if (err) error.value = err.message;
    else await loadAll();
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
    if (meRow?.role === 'parent') {
        // Parents redeem kids' quests from the Family page.
        navigateTo('/family');
        return;
    }
    householdId.value = meRow?.household_id ?? null;
    await loadAll();
});
</script>

<template>
    <main class="wrap">
        <p class="back"><NuxtLink to="/board">← Quest Board</NuxtLink></p>
        <h1>🎁 My quests</h1>

        <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
        <p v-if="loading" class="muted">Loading…</p>

        <template v-else>
            <!-- Level + spendable -->
            <section class="hero">
                <div class="level-row">
                    <span class="lvl-badge">Lv {{ level.level }}</span>
                    <div class="lvl-bar">
                        <div
                            class="lvl-fill"
                            :style="{ width: level.pct + '%' }"
                        />
                    </div>
                    <span class="lvl-next">{{ level.toNext }} to next</span>
                </div>
                <p class="spend">
                    <span class="spend-star">⭐</span>
                    <strong>{{ spendable }}</strong> XP to spend
                </p>
            </section>

            <!-- New quest -->
            <section class="card">
                <h2>Save up for something</h2>
                <form @submit.prevent="createQuest">
                    <mfp-input
                        label="What do you want?"
                        name="title"
                        placeholder="New video game"
                        :value.prop="title"
                        @input="
                            title = ($event.target as HTMLInputElement).value
                        "
                    />
                    <mfp-input
                        label="XP goal"
                        name="target"
                        type="number"
                        inputmode="numeric"
                        placeholder="2000"
                        :value.prop="targetDisplay"
                        @input="
                            target =
                                Number(
                                    ($event.target as HTMLInputElement).value,
                                ) || null
                        "
                    />
                    <mfp-button
                        type="submit"
                        variant="primary"
                        :disabled="creating"
                    >
                        {{ creating ? 'Adding…' : 'Add quest' }}
                    </mfp-button>
                </form>
            </section>

            <!-- Active quests -->
            <section v-if="activeQuests.length" class="card">
                <h2>Working toward</h2>
                <ul class="list">
                    <li v-for="q in activeQuests" :key="q.id" class="quest">
                        <div class="quest-head">
                            <strong>{{ q.title }}</strong>
                            <span
                                class="q-status"
                                :class="isReady(q) ? 'ready' : 'saving'"
                            >
                                {{
                                    isReady(q)
                                        ? 'Ready! Ask a grown-up 🎉'
                                        : `${spendable}/${q.target_xp} XP`
                                }}
                            </span>
                        </div>
                        <div class="bar">
                            <div
                                class="fill"
                                :class="{ full: isReady(q) }"
                                :style="{ width: progressPct(q) + '%' }"
                            />
                        </div>
                        <button
                            class="link"
                            :disabled="busyId === q.id"
                            @click="removeQuest(q.id)"
                        >
                            Remove
                        </button>
                    </li>
                </ul>
            </section>

            <!-- Redeemed -->
            <section v-if="redeemedQuests.length" class="card">
                <h2>🏆 Redeemed</h2>
                <ul class="list">
                    <li v-for="q in redeemedQuests" :key="q.id" class="done">
                        <strong>{{ q.title }}</strong>
                        <span class="q-cost">−{{ q.target_xp }} XP</span>
                    </li>
                </ul>
            </section>
        </template>
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
.hero {
    background: var(--color-brand-subtle, #efe7ff);
    border-radius: var(--radius-lg, 1rem);
    padding: 1rem;
    margin-bottom: 1.25rem;
}
.level-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
}
.lvl-badge {
    font-family: 'Baloo 2', var(--font-family-sans);
    font-weight: 800;
    color: var(--color-brand-primary, #6c4ce0);
    white-space: nowrap;
}
.lvl-bar {
    flex: 1;
    height: 0.6rem;
    border-radius: 999px;
    background: #fff;
    overflow: hidden;
}
.lvl-fill {
    height: 100%;
    background: var(--color-brand-primary, #6c4ce0);
}
.lvl-next {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    white-space: nowrap;
}
.spend {
    margin: 0.75rem 0 0;
    font-size: 1.1rem;
}
.spend-star {
    font-size: 1.2rem;
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
.list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
.quest-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
}
.q-status {
    font-size: 0.8rem;
    font-weight: 700;
    white-space: nowrap;
}
.q-status.ready {
    color: #1f7a34;
}
.q-status.saving {
    color: var(--color-brand-primary, #6c4ce0);
}
.bar {
    height: 0.7rem;
    border-radius: 999px;
    background: var(--color-surface-muted, #f0edf7);
    overflow: hidden;
}
.fill {
    height: 100%;
    background: var(--color-brand-primary, #6c4ce0);
    transition: width 0.3s ease;
}
.fill.full {
    background: #1f9d43;
}
.link {
    margin-top: 0.4rem;
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    font-size: 0.8rem;
    color: var(--color-text-muted);
    text-decoration: underline;
    cursor: pointer;
}
.done {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface-muted, #f5f3f7);
    opacity: 0.85;
}
.q-cost {
    color: #b3261e;
    font-weight: 700;
}
</style>
