<script setup lang="ts">
// Parent-only: the weekly pay gate (SPEC §3a). For each kid it shows the week's
// paid earnings and whether their pay-gating required chores are done. If a kid
// hasn't finished, the parent decides: release the money or hold it. Nothing is
// ever auto-forfeited — this just records your call.
const supabase = useSupabaseClient();
const { authFetch } = useApi();

interface KidGate {
    kid_id: string;
    display_name: string;
    week_start: string;
    required_total: number;
    required_done: number;
    earned_cents: number;
    computed_status: 'met' | 'unmet';
    decision: 'released' | 'held' | null;
}

const gates = ref<KidGate[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const busyId = ref<string | null>(null);
// Any date inside the week we're viewing; shifts by 7 days with the arrows.
const weekDate = ref<Date>(new Date());

function ymd(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const weekLabel = computed(() => {
    const start = gates.value[0]?.week_start;
    if (!start) return '';
    const s = new Date(`${start}T12:00:00`);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    const fmt = (d: Date) =>
        d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${fmt(s)} – ${fmt(e)}`;
});

function dollars(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

function apiMessage(e: unknown): string {
    const err = e as { data?: { message?: string }; message?: string };
    return err?.data?.message || err?.message || 'Something went wrong';
}

async function load() {
    loading.value = true;
    error.value = null;
    try {
        gates.value = await authFetch<KidGate[]>(
            `/weekly-gates?week=${ymd(weekDate.value)}`,
        );
    } catch (e) {
        error.value = apiMessage(e);
    }
    loading.value = false;
}

function shiftWeek(deltaDays: number) {
    const d = new Date(weekDate.value);
    d.setDate(d.getDate() + deltaDays);
    weekDate.value = d;
    void load();
}

async function decide(g: KidGate, decision: 'release' | 'hold') {
    error.value = null;
    busyId.value = g.kid_id;
    try {
        await authFetch('/weekly-gates/decide', {
            method: 'POST',
            body: {
                kid_id: g.kid_id,
                week_start: g.week_start,
                decision,
            },
        });
        await load();
    } catch (e) {
        error.value = apiMessage(e);
    }
    busyId.value = null;
}

// Effective status label + style for a kid's week.
function statusOf(g: KidGate): { label: string; cls: string } {
    if (g.decision === 'released') return { label: 'Released ✅', cls: 'ok' };
    if (g.decision === 'held') return { label: 'Held ⏸️', cls: 'held' };
    if (g.computed_status === 'met') return { label: 'On track ✅', cls: 'ok' };
    return { label: 'Needs review ⚠️', cls: 'warn' };
}

onMounted(async () => {
    const { data, error: err } = await supabase.auth.getUser();
    if (err || !data.user) {
        navigateTo('/login');
        return;
    }
    const { data: me, error: meErr } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();
    if (meErr) {
        // Don't bounce a real parent to /dashboard on a transient error.
        error.value = meErr.message;
        return;
    }
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
        <h1>💵 Weekly pay</h1>

        <div class="weeknav">
            <mfp-button variant="ghost" @click="shiftWeek(-7)"
                >‹ Prev</mfp-button
            >
            <span class="week-label">{{ weekLabel || '…' }}</span>
            <mfp-button variant="ghost" @click="shiftWeek(7)"
                >Next ›</mfp-button
            >
        </div>

        <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
        <p v-if="loading" class="muted">Loading…</p>

        <p v-else-if="!gates.length" class="muted">
            No kids yet — add one on the Family page.
        </p>

        <ul v-else class="list">
            <li v-for="g in gates" :key="g.kid_id" class="card">
                <div class="head">
                    <strong class="name">{{ g.display_name }}</strong>
                    <span class="status" :class="statusOf(g).cls">
                        {{ statusOf(g).label }}
                    </span>
                </div>

                <p class="earned">
                    Earned this week:
                    <strong>{{ dollars(g.earned_cents) }}</strong>
                </p>

                <p v-if="g.required_total > 0" class="req">
                    Required chores: {{ g.required_done }}/{{
                        g.required_total
                    }}
                    done
                    <template v-if="g.required_done < g.required_total">
                        · <span class="warn-text">still owes some</span>
                    </template>
                </p>
                <p v-else class="req muted">No pay-gating chores this week.</p>

                <!-- Decide when the gate is unmet, or to change a prior call. -->
                <div
                    v-if="g.computed_status === 'unmet' || g.decision"
                    class="actions"
                >
                    <mfp-button
                        :variant="
                            g.decision === 'released' ? 'primary' : 'secondary'
                        "
                        :disabled="busyId === g.kid_id"
                        @click="decide(g, 'release')"
                    >
                        Release
                    </mfp-button>
                    <mfp-button
                        :variant="
                            g.decision === 'held' ? 'primary' : 'secondary'
                        "
                        :disabled="busyId === g.kid_id"
                        @click="decide(g, 'hold')"
                    >
                        Hold
                    </mfp-button>
                </div>
            </li>
        </ul>
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
    margin-bottom: 0.75rem;
}
.weeknav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 1rem;
}
.week-label {
    font-weight: 700;
}
.muted {
    color: var(--color-text-muted);
}
.list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
.card {
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-surface-muted, #eee);
    border-radius: var(--radius-lg, 1rem);
    padding: 1rem;
}
.head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
}
.name {
    font-family: 'Baloo 2', var(--font-family-sans);
    font-size: 1.15rem;
}
.status {
    font-size: 0.8rem;
    font-weight: 800;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    white-space: nowrap;
}
.status.ok {
    background: #d6f5d6;
    color: #1f7a34;
}
.status.warn {
    background: #ffe2cc;
    color: #a5510a;
}
.status.held {
    background: #ffd6d6;
    color: #b3261e;
}
.earned {
    margin: 0.25rem 0;
}
.req {
    margin: 0.25rem 0 0.75rem;
    font-size: 0.9rem;
}
.warn-text {
    color: #a5510a;
    font-weight: 700;
}
.actions {
    display: flex;
    gap: 0.5rem;
}
</style>
