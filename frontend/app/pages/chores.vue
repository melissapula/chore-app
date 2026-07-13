<script setup lang="ts">
// Parent view for the paid-chore flow (build step 2, now on the frontend):
// create a chore template, spawn it into the live pool, and watch the pool.
// Claiming/approving arrive once the household has kids (next step).
const { authFetch } = useApi();

interface Chore {
    id: string;
    title: string;
    icon_emoji: string | null;
    chore_type: 'paid' | 'required';
    value_cents: number;
    active: boolean;
}

interface Instance {
    id: string;
    state: string;
    value_cents_snapshot: number;
    claimed_by: string | null;
    chores: {
        title: string;
        icon_emoji: string | null;
        chore_type: string;
    } | null;
}

const templates = ref<Chore[]>([]);
const pool = ref<Instance[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

// new-chore form
const title = ref('');
const emoji = ref('');
const xp = ref<number | null>(null);
const creating = ref(false);

// mfp-input wants a string value; render the numeric XP (or empty) for binding.
const xpDisplay = computed(() => (xp.value === null ? '' : String(xp.value)));

// Fill the form from a picked preset (common gamified chore, or a custom one).
function onPreset(p: { title: string; emoji: string; xp: number }) {
    title.value = p.title;
    emoji.value = p.emoji || '';
    xp.value = p.xp || null;
}

const STATE_LABEL: Record<string, string> = {
    OPEN: 'Open',
    CLAIMED: 'Claimed',
    IN_PROGRESS: 'In progress',
    SUBMITTED: 'Submitted',
    APPROVED: 'Approved',
};

function apiMessage(e: unknown): string {
    const err = e as { data?: { message?: string }; message?: string };
    return err?.data?.message || err?.message || 'Something went wrong';
}

async function loadAll() {
    loading.value = true;
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
    loading.value = false;
}

async function createChore() {
    error.value = null;
    if (!title.value.trim()) {
        error.value = 'Give your chore a name.';
        return;
    }
    creating.value = true;
    try {
        await authFetch<Chore>('/chores', {
            method: 'POST',
            body: {
                title: title.value.trim(),
                chore_type: 'paid',
                icon_emoji: emoji.value.trim() || undefined,
                value_cents:
                    xp.value && xp.value > 0 ? Math.round(xp.value) : 0,
            },
        });
        title.value = '';
        emoji.value = '';
        xp.value = null;
        await loadAll();
    } catch (e) {
        error.value = apiMessage(e);
    }
    creating.value = false;
}

async function addToPool(id: string) {
    error.value = null;
    try {
        await authFetch(`/chores/${id}/instances`, { method: 'POST' });
        await loadAll();
    } catch (e) {
        error.value = apiMessage(e);
    }
}

onMounted(loadAll);
</script>

<template>
    <main class="wrap">
        <p class="back"><NuxtLink to="/dashboard">← Dashboard</NuxtLink></p>
        <h1>⚔️ Chores</h1>

        <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>

        <!-- Create -->
        <section class="card">
            <h2>New chore</h2>
            <form @submit.prevent="createChore">
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
                            emoji = ($event.target as HTMLInputElement).value
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
                                    ($event.target as HTMLInputElement).value,
                                ) || null
                        "
                    />
                </div>

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
                        <span class="xp">{{ c.value_cents }} XP</span>
                    </span>
                    <mfp-button variant="secondary" @click="addToPool(c.id)">
                        Add to pool
                    </mfp-button>
                </li>
            </ul>
        </section>

        <!-- Pool -->
        <section v-if="!loading" class="card">
            <h2>The pool</h2>
            <p v-if="!pool.length" class="muted">
                Nothing in the pool yet. Add a chore to the pool for the kids to
                claim.
            </p>
            <ul v-else class="list">
                <li v-for="i in pool" :key="i.id" class="item">
                    <span class="icon">{{ i.chores?.icon_emoji || '📋' }}</span>
                    <span class="grow">
                        <strong>{{ i.chores?.title || 'Chore' }}</strong>
                        <span class="xp">{{ i.value_cents_snapshot }} XP</span>
                    </span>
                    <span class="badge" :class="`s-${i.state}`">
                        {{ STATE_LABEL[i.state] || i.state }}
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
form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}
.row {
    display: flex;
    gap: 0.75rem;
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
.item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface-muted, #f5f3f7);
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
.s-APPROVED {
    background: #d6f5d6;
    color: #1f7a34;
}
</style>
