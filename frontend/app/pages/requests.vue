<script setup lang="ts">
// Kid-initiated chore requests (SPEC §4e). A kid pitches a chore; the parent
// turns it into a real chore (approve → creates a paid template and stamps its
// id back) or declines. Reads/writes go through Supabase (RLS): kids see & make
// their own, parents see all and resolve.
const supabase = useSupabaseClient();
const { authFetch } = useApi();

interface Request {
    id: string;
    requested_by: string;
    title: string;
    note: string | null;
    suggested_xp: number | null;
    status: 'pending' | 'approved' | 'declined';
    chore_id: string | null;
    created_at: string;
}

const uid = ref<string | null>(null);
const householdId = ref<string | null>(null);
const isParent = ref(false);
const requests = ref<Request[]>([]);
const names = ref<Record<string, string>>({});
const loading = ref(true);
const error = ref<string | null>(null);
const busyId = ref<string | null>(null);

// kid submit form
const title = ref('');
const note = ref('');
const xp = ref<number | null>(null);
const submitting = ref(false);
const xpDisplay = computed(() => (xp.value === null ? '' : String(xp.value)));

const pending = computed(() =>
    requests.value.filter((r) => r.status === 'pending'),
);
const resolved = computed(() =>
    requests.value.filter((r) => r.status !== 'pending'),
);

const STATUS_LABEL: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved ✅',
    declined: 'Declined',
};

function apiMessage(e: unknown): string {
    const err = e as { data?: { message?: string }; message?: string };
    return err?.data?.message || err?.message || 'Something went wrong';
}

async function load() {
    loading.value = true;
    error.value = null;
    const [reqRes, memRes] = await Promise.all([
        supabase
            .from('chore_requests')
            .select(
                'id, requested_by, title, note, suggested_xp, status, chore_id, created_at',
            )
            .order('created_at', { ascending: false }),
        supabase.from('users').select('id, display_name'),
    ]);
    if (reqRes.error) error.value = reqRes.error.message;
    else requests.value = (reqRes.data ?? []) as Request[];
    const map: Record<string, string> = {};
    for (const u of (memRes.data ?? []) as {
        id: string;
        display_name: string;
    }[]) {
        map[u.id] = u.display_name;
    }
    names.value = map;
    loading.value = false;
}

async function submit() {
    error.value = null;
    if (!title.value.trim()) {
        error.value = 'What chore do you want to do?';
        return;
    }
    if (!householdId.value) return;
    submitting.value = true;
    const { error: err } = await supabase.from('chore_requests').insert({
        household_id: householdId.value,
        requested_by: uid.value,
        title: title.value.trim(),
        note: note.value.trim() || null,
        suggested_xp: xp.value && xp.value > 0 ? Math.round(xp.value) : null,
    });
    submitting.value = false;
    if (err) {
        error.value = err.message;
        return;
    }
    title.value = '';
    note.value = '';
    xp.value = null;
    await load();
}

async function approve(r: Request) {
    error.value = null;
    busyId.value = r.id;
    try {
        // Idempotent: if a prior attempt already created the chore (stamped its
        // id), reuse it instead of creating a duplicate on retry / double-click.
        let choreId = r.chore_id;
        if (!choreId) {
            const chore = await authFetch<{ id: string }>('/chores', {
                method: 'POST',
                body: {
                    title: r.title,
                    chore_type: 'paid',
                    value_cents: r.suggested_xp ?? 0,
                },
            });
            choreId = chore.id;
        }
        // …stamp it back onto the request.
        const { error: err } = await supabase
            .from('chore_requests')
            .update({
                status: 'approved',
                chore_id: choreId,
                resolved_by: uid.value,
                resolved_at: new Date().toISOString(),
            })
            .eq('id', r.id);
        if (err) throw err;
        await load();
    } catch (e) {
        error.value = apiMessage(e);
    }
    busyId.value = null;
}

async function decline(r: Request) {
    error.value = null;
    busyId.value = r.id;
    const { error: err } = await supabase
        .from('chore_requests')
        .update({
            status: 'declined',
            resolved_by: uid.value,
            resolved_at: new Date().toISOString(),
        })
        .eq('id', r.id);
    busyId.value = null;
    if (err) error.value = err.message;
    else await load();
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
    await load();
});
</script>

<template>
    <main class="wrap">
        <p class="back"><NuxtLink to="/dashboard">← Dashboard</NuxtLink></p>
        <h1>💬 Chore ideas</h1>

        <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
        <p v-if="loading" class="muted">Loading…</p>

        <template v-else>
            <!-- Kid: pitch a chore -->
            <section v-if="!isParent" class="card">
                <h2>Pitch a chore</h2>
                <form @submit.prevent="submit">
                    <mfp-input
                        label="What do you want to do?"
                        name="title"
                        placeholder="Rake the leaves"
                        :value.prop="title"
                        @input="
                            title = ($event.target as HTMLInputElement).value
                        "
                    />
                    <mfp-input
                        label="Why? (optional)"
                        name="note"
                        placeholder="The yard's covered in leaves"
                        :value.prop="note"
                        @input="
                            note = ($event.target as HTMLInputElement).value
                        "
                    />
                    <mfp-input
                        label="XP you think it's worth (optional)"
                        name="xp"
                        type="number"
                        inputmode="numeric"
                        placeholder="150"
                        :value.prop="xpDisplay"
                        @input="
                            xp =
                                Number(
                                    ($event.target as HTMLInputElement).value,
                                ) || null
                        "
                    />
                    <mfp-button
                        type="submit"
                        variant="primary"
                        :disabled="submitting"
                    >
                        {{ submitting ? 'Sending…' : 'Send to a grown-up' }}
                    </mfp-button>
                </form>
            </section>

            <!-- Parent: pending requests to resolve -->
            <section v-if="isParent" class="card">
                <h2>Pending requests</h2>
                <p v-if="!pending.length" class="muted">
                    No pending requests right now.
                </p>
                <ul v-else class="list">
                    <li v-for="r in pending" :key="r.id" class="req">
                        <div class="req-main">
                            <strong>{{ r.title }}</strong>
                            <span class="req-meta">
                                from {{ names[r.requested_by] || 'a kid' }}
                                <template v-if="r.suggested_xp"
                                    >· suggests
                                    {{ r.suggested_xp }} XP</template
                                >
                            </span>
                            <span v-if="r.note" class="req-note">{{
                                r.note
                            }}</span>
                        </div>
                        <div class="req-actions">
                            <mfp-button
                                variant="primary"
                                :disabled="busyId === r.id"
                                @click="approve(r)"
                            >
                                Approve
                            </mfp-button>
                            <mfp-button
                                variant="ghost"
                                :disabled="busyId === r.id"
                                @click="decline(r)"
                            >
                                Decline
                            </mfp-button>
                        </div>
                    </li>
                </ul>
                <p v-if="pending.length" class="muted small hint">
                    Approving creates a paid chore you can tweak and add to the
                    pool on the Chores page.
                </p>
            </section>

            <!-- Everyone: the history. Kids see all of theirs (incl. pending) so
                 they get confirmation and don't resubmit; parents see resolved. -->
            <section
                v-if="isParent ? resolved.length : requests.length"
                class="card"
            >
                <h2>{{ isParent ? 'Resolved' : 'Your requests' }}</h2>
                <ul class="list">
                    <li
                        v-for="r in isParent ? resolved : requests"
                        :key="r.id"
                        class="item"
                    >
                        <span class="grow">
                            <strong>{{ r.title }}</strong>
                            <span v-if="isParent" class="req-meta"
                                >from
                                {{ names[r.requested_by] || 'a kid' }}</span
                            >
                        </span>
                        <span class="badge" :class="`st-${r.status}`">
                            {{ STATUS_LABEL[r.status] || r.status }}
                        </span>
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
.small {
    font-size: 0.8rem;
}
.hint {
    margin: 0.75rem 0 0;
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
    gap: 0.6rem;
}
.req {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface-muted, #f5f3f7);
}
.req-main {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
}
.req-meta {
    font-size: 0.8rem;
    color: var(--color-text-muted);
}
.req-note {
    font-size: 0.85rem;
}
.req-actions {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex: none;
}
.item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface-muted, #f5f3f7);
}
.grow {
    flex: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}
.badge {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    white-space: nowrap;
    background: #e6e0f5;
    color: #4a3aa8;
}
.st-approved {
    background: #d6f5d6;
    color: #1f7a34;
}
.st-declined {
    background: #ffd6d6;
    color: #b3261e;
}
.st-pending {
    background: #fff0cc;
    color: #8a6400;
}
</style>
