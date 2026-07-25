<script setup lang="ts">
// Guild quest (SPEC §4d): the household pools XP toward one family reward. Every
// kid's positive XP since the quest started counts; personal balances are
// untouched. The contribution chart (a segmented bar + legend) shows who added
// what — aggregated server-side because a kid can't read siblings' ledgers.
// Colors follow the dataviz categorical palette, assigned by join order so each
// kid is the same color everywhere; the legend labels each segment (identity is
// never color-alone).
const supabase = useSupabaseClient();
const { authFetch } = useApi();

interface Contribution {
    kid_id: string;
    display_name: string;
    xp: number;
}
interface GuildQuest {
    id: string;
    title: string;
    reward: string | null;
    target_xp: number;
    status: string;
    started_at: string;
}
interface GuildView {
    quest: GuildQuest | null;
    progress: number;
    contributions: Contribution[];
}

const isParent = ref(false);
const view = ref<GuildView | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const busy = ref(false);

// create form
const showForm = ref(false);
const title = ref('');
const reward = ref('');
const target = ref<number | null>(null);
const targetDisplay = computed(() =>
    target.value === null ? '' : String(target.value),
);

const quest = computed(() => view.value?.quest ?? null);
const contributions = computed(() => view.value?.contributions ?? []);
const progress = computed(() => view.value?.progress ?? 0);
const pct = computed(() =>
    quest.value
        ? Math.min(
              100,
              Math.round((progress.value / quest.value.target_xp) * 100),
          )
        : 0,
);
const reached = computed(
    () => !!quest.value && progress.value >= quest.value.target_xp,
);

// Segment width as a % of the whole target (so the bar fills to `pct`).
function widthPct(xp: number): number {
    if (!quest.value) return 0;
    return (xp / quest.value.target_xp) * 100;
}
function seg(i: number): string {
    return `var(--s${(i % 8) + 1})`;
}

function apiMessage(e: unknown): string {
    const err = e as { data?: { message?: string }; message?: string };
    return err?.data?.message || err?.message || 'Something went wrong';
}

async function load() {
    loading.value = true;
    error.value = null;
    try {
        view.value = await authFetch<GuildView>('/guild');
    } catch (e) {
        error.value = apiMessage(e);
    }
    loading.value = false;
}

async function createGuild() {
    error.value = null;
    if (!title.value.trim()) {
        error.value = 'Give your guild quest a name.';
        return;
    }
    if (!target.value || target.value <= 0) {
        error.value = 'Set an XP goal bigger than 0.';
        return;
    }
    busy.value = true;
    try {
        await authFetch('/guild', {
            method: 'POST',
            body: {
                title: title.value.trim(),
                reward: reward.value.trim() || undefined,
                target_xp: Math.round(target.value),
            },
        });
        title.value = '';
        reward.value = '';
        target.value = null;
        showForm.value = false;
        await load();
    } catch (e) {
        error.value = apiMessage(e);
    }
    busy.value = false;
}

async function complete() {
    if (!quest.value) return;
    error.value = null;
    busy.value = true;
    try {
        await authFetch(`/guild/${quest.value.id}/complete`, {
            method: 'POST',
        });
        await load();
    } catch (e) {
        error.value = apiMessage(e);
    }
    busy.value = false;
}

onMounted(async () => {
    const { data, error: err } = await supabase.auth.getUser();
    if (err || !data.user) {
        navigateTo('/login');
        return;
    }
    const { data: me } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();
    isParent.value = (me as { role?: string } | null)?.role === 'parent';
    await load();
});
</script>

<template>
    <main class="wrap">
        <p class="back"><NuxtLink to="/dashboard">← Dashboard</NuxtLink></p>
        <h1>🛡️ Guild quest</h1>

        <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
        <p v-if="loading" class="muted">Loading…</p>

        <template v-else>
            <!-- Active guild quest -->
            <section v-if="quest" class="card viz-root">
                <div class="q-head">
                    <div>
                        <h2>{{ quest.title }}</h2>
                        <p v-if="quest.reward" class="reward">
                            Reward: {{ quest.reward }}
                        </p>
                    </div>
                    <span v-if="reached" class="reached">🎉 Reached!</span>
                </div>

                <p class="figure">
                    <strong>{{ progress.toLocaleString() }}</strong>
                    <span class="of"
                        >/ {{ quest.target_xp.toLocaleString() }} XP</span
                    >
                    <span class="pct">{{ pct }}%</span>
                </p>

                <!-- Contribution chart: one segment per kid -->
                <div
                    class="bar"
                    role="img"
                    :aria-label="`Guild progress ${pct}% — ${contributions
                        .map((c) => `${c.display_name} ${c.xp} XP`)
                        .join(', ')}`"
                >
                    <div
                        v-for="(c, i) in contributions"
                        v-show="c.xp > 0"
                        :key="c.kid_id"
                        class="seg"
                        :style="{
                            width: widthPct(c.xp) + '%',
                            background: seg(i),
                        }"
                    />
                </div>

                <!-- Legend = direct labels (identity never color-alone) -->
                <ul class="legend">
                    <li v-for="(c, i) in contributions" :key="c.kid_id">
                        <span class="swatch" :style="{ background: seg(i) }" />
                        <span class="who">{{ c.display_name }}</span>
                        <span class="amt">{{ c.xp.toLocaleString() }} XP</span>
                    </li>
                </ul>

                <div v-if="isParent" class="q-actions">
                    <mfp-button
                        v-if="reached"
                        variant="primary"
                        :disabled="busy"
                        @click="complete"
                    >
                        {{ busy ? 'Saving…' : 'Mark granted 🎁' }}
                    </mfp-button>
                    <mfp-button
                        variant="ghost"
                        :disabled="busy"
                        @click="showForm = !showForm"
                    >
                        Start a new one
                    </mfp-button>
                </div>
            </section>

            <!-- No active quest -->
            <section v-else class="card">
                <p v-if="!isParent" class="muted">
                    No guild quest right now — ask a grown-up to start one, then
                    everyone's XP helps reach it together!
                </p>
                <p v-else-if="!showForm" class="muted intro">
                    Start a family goal everyone chips in XP toward.
                </p>
                <mfp-button
                    v-if="isParent && !showForm"
                    variant="primary"
                    @click="showForm = true"
                >
                    Start a guild quest
                </mfp-button>
            </section>

            <!-- Create form (parent) -->
            <section v-if="isParent && showForm" class="card">
                <h2>New guild quest</h2>
                <form @submit.prevent="createGuild">
                    <mfp-input
                        label="Family goal"
                        name="title"
                        placeholder="Family trip to the water park"
                        :value.prop="title"
                        @input="
                            title = ($event.target as HTMLInputElement).value
                        "
                    />
                    <mfp-input
                        label="Reward (optional)"
                        name="reward"
                        placeholder="A day out together"
                        :value.prop="reward"
                        @input="
                            reward = ($event.target as HTMLInputElement).value
                        "
                    />
                    <mfp-input
                        label="XP goal"
                        name="target"
                        type="number"
                        inputmode="numeric"
                        placeholder="5000"
                        :value.prop="targetDisplay"
                        @input="
                            target =
                                Number(
                                    ($event.target as HTMLInputElement).value,
                                ) || null
                        "
                    />
                    <p class="muted small">
                        Counts everyone's XP from now on. Starting a new quest
                        replaces the current one.
                    </p>
                    <mfp-button
                        type="submit"
                        variant="primary"
                        :disabled="busy"
                    >
                        {{ busy ? 'Starting…' : 'Start guild quest' }}
                    </mfp-button>
                </form>
            </section>
        </template>
    </main>
</template>

<style scoped>
/* Categorical palette (dataviz skill) — fixed hue order, one per kid. Both
   modes are selected; dark is the same hues stepped for the dark surface. */
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
    font-size: 1.15rem;
    margin: 0;
}
.muted {
    color: var(--color-text-muted);
}
.small {
    font-size: 0.8rem;
    margin: 0;
}
.intro {
    margin-top: 0;
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
    margin-top: 0.75rem;
}
.q-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
}
.reward {
    margin: 0.25rem 0 0;
    color: var(--color-text-muted);
    font-size: 0.9rem;
}
.reached {
    font-weight: 800;
    color: #1f7a34;
    white-space: nowrap;
}
.figure {
    margin: 0.75rem 0;
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
    gap: 2px; /* 2px surface gap between segments */
    height: 1.4rem;
    border-radius: 999px;
    background: var(--track);
    overflow: hidden;
    margin-bottom: 0.75rem;
}
.seg {
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
.who {
    flex: 1;
}
.amt {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-default);
}
.q-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    flex-wrap: wrap;
}
</style>
