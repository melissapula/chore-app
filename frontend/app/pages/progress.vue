<script setup lang="ts">
// Parent-only snapshot of how each kid is doing (levels, quest progress, and the
// household's guild-quest progress). Parents can read every kid's ledger, quests,
// and the guild view under RLS, so this assembles client-side — no backend.
const supabase = useSupabaseClient();
const { authFetch } = useApi();

interface Kid {
    id: string;
    display_name: string;
    avatar_emoji: string | null;
    avatar_url: string | null;
}
interface Quest {
    id: string;
    kid_id: string;
    title: string;
    target_xp: number;
}
interface GuildView {
    quest: { title: string; target_xp: number } | null;
    progress: number;
    contributions: { kid_id: string; display_name: string; xp: number }[];
}

const kids = ref<Kid[]>([]);
const ledger = ref<{ kid_id: string; delta_cents: number }[]>([]);
const quests = ref<Quest[]>([]);
const guild = ref<GuildView | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

// --- per-kid rollups ---
function spendable(kidId: string): number {
    return ledger.value
        .filter((l) => l.kid_id === kidId)
        .reduce((s, l) => s + l.delta_cents, 0);
}
function lifetime(kidId: string): number {
    return ledger.value
        .filter((l) => l.kid_id === kidId && l.delta_cents > 0)
        .reduce((s, l) => s + l.delta_cents, 0);
}
function questsFor(kidId: string): Quest[] {
    return quests.value.filter((q) => q.kid_id === kidId);
}
function guildXp(kidId: string): number {
    return guild.value?.contributions.find((c) => c.kid_id === kidId)?.xp ?? 0;
}
function pct(part: number, whole: number): number {
    if (whole <= 0) return 0;
    return Math.min(100, Math.round((part / whole) * 100));
}

const guildPct = computed(() =>
    guild.value?.quest
        ? pct(guild.value.progress, guild.value.quest.target_xp)
        : 0,
);

async function load() {
    loading.value = true;
    error.value = null;
    const [kidsRes, ledRes, qRes] = await Promise.all([
        supabase
            .from('users')
            .select('id, display_name, avatar_emoji, avatar_url')
            .eq('role', 'kid')
            .order('created_at', { ascending: true }),
        supabase.from('ledger_entries').select('kid_id, delta_cents'),
        supabase
            .from('quests')
            .select('id, kid_id, title, target_xp')
            .eq('scope', 'personal')
            .eq('status', 'active'),
    ]);
    if (kidsRes.error) error.value = kidsRes.error.message;
    else kids.value = (kidsRes.data ?? []) as Kid[];
    if (!ledRes.error)
        ledger.value = (ledRes.data ?? []) as typeof ledger.value;
    if (!qRes.error) quests.value = (qRes.data ?? []) as Quest[];
    try {
        guild.value = await authFetch<GuildView>('/guild');
    } catch {
        guild.value = null;
    }
    loading.value = false;
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
    if ((me as { role?: string } | null)?.role !== 'parent') {
        navigateTo('/dashboard');
        return;
    }
    await load();
});
</script>

<template>
    <main class="wrap">
        <p class="back"><NuxtLink to="/dashboard">← Dashboard</NuxtLink></p>
        <h1>📊 How's everyone doing?</h1>

        <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
        <p v-if="loading" class="muted">Loading…</p>

        <template v-else>
            <!-- Guild goal overview -->
            <section class="card guild">
                <h2>🛡️ Guild quest</h2>
                <template v-if="guild?.quest">
                    <div class="g-row">
                        <strong>{{ guild.quest.title }}</strong>
                        <span class="g-num"
                            >{{ guild.progress.toLocaleString() }} /
                            {{
                                guild.quest.target_xp.toLocaleString()
                            }}
                            XP</span
                        >
                    </div>
                    <div class="bar">
                        <div
                            class="fill guild-fill"
                            :class="{ full: guildPct >= 100 }"
                            :style="{ width: guildPct + '%' }"
                        />
                    </div>
                    <p class="g-caption">
                        {{ guildPct }}% there
                        <span v-if="guildPct >= 100"> · 🎉 reached!</span>
                    </p>
                </template>
                <p v-else class="muted">
                    No guild quest running — start one from the Guild quest
                    page.
                </p>
            </section>

            <!-- Per-kid snapshot -->
            <p v-if="!kids.length" class="muted">
                No kids yet — add one on the Family page.
            </p>

            <section v-for="k in kids" :key="k.id" class="card kid">
                <div class="kid-head">
                    <span class="avatar">
                        <img v-if="k.avatar_url" :src="k.avatar_url" alt="" />
                        <template v-else>{{ k.avatar_emoji || '🦸' }}</template>
                    </span>
                    <strong class="kid-name">{{ k.display_name }}</strong>
                    <span class="spend">⭐ {{ spendable(k.id) }} XP</span>
                </div>

                <!-- Level -->
                <div class="metric">
                    <div class="metric-head">
                        <span class="lvl-badge"
                            >Level {{ levelInfo(lifetime(k.id)).level }}</span
                        >
                        <span class="metric-note"
                            >{{ levelInfo(lifetime(k.id)).toNext }} XP to
                            next</span
                        >
                    </div>
                    <div class="bar">
                        <div
                            class="fill"
                            :style="{
                                width: levelInfo(lifetime(k.id)).pct + '%',
                            }"
                        />
                    </div>
                </div>

                <!-- Quests -->
                <div class="metric">
                    <div class="metric-head">
                        <span class="sub">🎁 Quests</span>
                    </div>
                    <p v-if="!questsFor(k.id).length" class="muted small">
                        No active quests.
                    </p>
                    <ul v-else class="qlist">
                        <li v-for="q in questsFor(k.id)" :key="q.id">
                            <div class="q-row">
                                <span class="q-title">{{ q.title }}</span>
                                <span
                                    class="q-amt"
                                    :class="{
                                        ready: spendable(k.id) >= q.target_xp,
                                    }"
                                >
                                    {{
                                        spendable(k.id) >= q.target_xp
                                            ? 'Ready! 🎉'
                                            : `${Math.min(
                                                  spendable(k.id),
                                                  q.target_xp,
                                              )}/${q.target_xp} XP`
                                    }}
                                </span>
                            </div>
                            <div class="bar thin">
                                <div
                                    class="fill"
                                    :class="{
                                        full: spendable(k.id) >= q.target_xp,
                                    }"
                                    :style="{
                                        width:
                                            pct(spendable(k.id), q.target_xp) +
                                            '%',
                                    }"
                                />
                            </div>
                        </li>
                    </ul>
                </div>

                <!-- Guild contribution -->
                <div v-if="guild?.quest" class="metric">
                    <div class="metric-head">
                        <span class="sub">🛡️ Guild contribution</span>
                        <span class="metric-note">{{ guildXp(k.id) }} XP</span>
                    </div>
                    <div class="bar thin">
                        <div
                            class="fill guild-fill"
                            :style="{
                                width:
                                    pct(guildXp(k.id), guild.quest.target_xp) +
                                    '%',
                            }"
                        />
                    </div>
                </div>
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
    font-size: 1.4rem;
}
h2 {
    font-family: 'Baloo 2', var(--font-family-sans);
    font-size: 1.05rem;
    margin: 0 0 0.6rem;
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
.card.guild {
    background: var(--color-brand-subtle, #efe7ff);
    border: none;
}
.g-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
}
.g-num {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--color-brand-primary, #6c4ce0);
    white-space: nowrap;
}
.g-caption {
    margin: 0.4rem 0 0;
    font-size: 0.85rem;
    color: var(--color-text-muted);
}
/* kid card */
.kid-head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.9rem;
}
.avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;
    background: var(--color-surface-muted, #f5f3f7);
    flex: none;
}
.avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.kid-name {
    font-family: 'Baloo 2', var(--font-family-sans);
    font-size: 1.15rem;
    flex: 1;
}
.spend {
    font-weight: 800;
    color: var(--color-brand-primary, #6c4ce0);
    white-space: nowrap;
}
.metric {
    margin-bottom: 0.9rem;
}
.metric:last-child {
    margin-bottom: 0;
}
.metric-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
}
.lvl-badge {
    font-family: 'Baloo 2', var(--font-family-sans);
    font-weight: 800;
    color: var(--color-brand-primary, #6c4ce0);
}
.sub {
    font-weight: 700;
    font-size: 0.9rem;
}
.metric-note {
    font-size: 0.78rem;
    color: var(--color-text-muted);
}
.bar {
    height: 0.7rem;
    border-radius: 999px;
    background: var(--color-surface-muted, #f0edf7);
    overflow: hidden;
}
.bar.thin {
    height: 0.55rem;
}
.fill {
    height: 100%;
    background: var(--color-brand-primary, #6c4ce0);
    transition: width 0.3s ease;
}
.fill.full {
    background: #1f9d43;
}
.guild-fill {
    background: #2a78d6;
}
.qlist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.q-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.2rem;
}
.q-title {
    font-size: 0.9rem;
}
.q-amt {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--color-brand-primary, #6c4ce0);
    white-space: nowrap;
}
.q-amt.ready {
    color: #1f7a34;
}
</style>
