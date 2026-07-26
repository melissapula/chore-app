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
    quest_title: string | null;
    icon_emoji: string | null;
    chore_type: 'paid' | 'required';
    value_cents: number;
    assigned_kid_id: string | null;
    eligible_kid_ids: string[] | null;
    due_type: string | null;
    gates_pay: boolean;
    is_risky: boolean;
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
    birthdate: string | null;
}

// SPEC §3b: the risky-chore warning only fires for kids under this age.
const RISKY_AGE = 12;

const templates = ref<Chore[]>([]);
const pool = ref<Instance[]>([]);
const kids = ref<Kid[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const busyId = ref<string | null>(null);
const openNotes = ref<string | null>(null); // instance id whose note thread is open
const removingId = ref<string | null>(null); // instance id awaiting remove confirm
const archivingId = ref<string | null>(null); // template id awaiting archive confirm
const archiveBusy = ref<string | null>(null); // template id mid archive/unarchive

// Templates split by active flag: archived ones leave the working list but stay
// around (can't be spawned — the backend blocks inactive templates) so a parent
// can restore them instead of losing the chore forever.
const activeTemplates = computed(() => templates.value.filter((c) => c.active));
const archivedTemplates = computed(() =>
    templates.value.filter((c) => !c.active),
);

// new-chore form
const choreType = ref<'paid' | 'required'>('paid');
const title = ref(''); // plain, canonical name (lists + search)
const questTitle = ref(''); // §4 gamified name kids see (optional)
const emoji = ref('');
const xp = ref<number | null>(null);
const isCustom = ref(false); // paid: chose "Create a custom chore" → editable name
const assignedKid = ref('');
const dueType = ref<'end_of_day' | 'end_of_week'>('end_of_day');
const gatesPay = ref(false);
const eligible = ref<string[]>([]); // paid: checked kids; empty/all = open to everyone
const isRisky = ref(false);
const riskyPrompt = ref<string | null>(null); // names awaiting the young-kid confirm
const riskyConfirmed = ref(false);
const creating = ref(false);

// edit-template state (inline)
const editId = ref<string | null>(null);
const editType = ref<'paid' | 'required'>('paid');
const editTitle = ref('');
const editQuestTitle = ref('');
const editEmoji = ref('');
const editXp = ref<number | null>(null);
const editAssignee = ref('');
const editDue = ref<'end_of_day' | 'end_of_week'>('end_of_day');
const editGates = ref(false);
const editEligible = ref<string[]>([]);
const editRisky = ref(false);
const editRiskyPrompt = ref<string | null>(null);
const editRiskyConfirmed = ref(false);
const savingEdit = ref(false);
const editXpDisplay = computed(() =>
    editXp.value === null ? '' : String(editXp.value),
);

// mfp-input wants a string value; render the numeric XP (or empty) for binding.
const xpDisplay = computed(() => (xp.value === null ? '' : String(xp.value)));

function kidName(id: string | null): string {
    if (!id) return 'a kid';
    return kids.value.find((k) => k.id === id)?.display_name ?? 'a kid';
}

function ageYears(birthdate: string): number {
    const b = new Date(birthdate);
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
}
// A warning only fires when we KNOW the kid is young (birthdate set + < RISKY_AGE).
function isYoung(k: Kid): boolean {
    return !!k.birthdate && ageYears(k.birthdate) < RISKY_AGE;
}
// Effective paid eligibility: empty OR everyone selected → null (open to all).
function effectiveEligible(sel: string[]): string[] | null {
    if (sel.length === 0 || sel.length >= kids.value.length) return null;
    return [...sel];
}
// Young kids this chore would be made available to (SPEC §3b risky net).
function youngAffected(
    risky: boolean,
    type: 'paid' | 'required',
    assigneeId: string,
    sel: string[],
): Kid[] {
    if (!risky) return [];
    if (type === 'required') {
        const k = kids.value.find((x) => x.id === assigneeId);
        return k && isYoung(k) ? [k] : [];
    }
    const ids = effectiveEligible(sel) ?? kids.value.map((k) => k.id);
    return kids.value.filter((k) => ids.includes(k.id) && isYoung(k));
}

// Fill the paid form from a picked preset (gamified chore, or a custom one).
// SPEC §4: store the PLAIN name as title (canonical/search) and the gamified
// name as quest_title (what kids see). For a custom chore the parent types one
// name (title); they can add a fun name separately.
function onPreset(p: {
    title: string; // gamified (preset) or the typed name (custom)
    plain: string; // plain/canonical
    emoji: string;
    xp: number;
    custom?: boolean;
}) {
    if (p.custom) {
        title.value = p.title;
        questTitle.value = '';
    } else {
        title.value = p.plain;
        questTitle.value = p.title;
    }
    emoji.value = p.emoji || '';
    xp.value = p.xp || null;
    isCustom.value = !!p.custom;
}

const onTabKeys = useTabKeys(['paid', 'required'] as const, choreType, (t) =>
    switchType(t),
);

function switchType(t: 'paid' | 'required') {
    choreType.value = t;
    // Reset shared fields so a paid preset doesn't bleed into a required chore.
    title.value = '';
    questTitle.value = '';
    emoji.value = '';
    xp.value = null;
    isCustom.value = false;
    eligible.value = [];
    isRisky.value = false;
    riskyPrompt.value = null;
    riskyConfirmed.value = false;
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
        .select('id, display_name, role, birthdate')
        .eq('role', 'kid');
    kids.value = (data ?? []) as Kid[];
}

function confirmRisky() {
    riskyConfirmed.value = true;
    void createChore();
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
    // §3b: a risky chore aimed at a young kid needs a soft confirmation first.
    const young = youngAffected(
        isRisky.value,
        choreType.value,
        assignedKid.value,
        eligible.value,
    );
    if (young.length && !riskyConfirmed.value) {
        riskyPrompt.value = young.map((k) => k.display_name).join(', ');
        return;
    }
    creating.value = true;
    try {
        const body =
            choreType.value === 'paid'
                ? {
                      title: title.value.trim(),
                      quest_title: questTitle.value.trim() || undefined,
                      chore_type: 'paid' as const,
                      icon_emoji: emoji.value.trim() || undefined,
                      value_cents:
                          xp.value && xp.value > 0 ? Math.round(xp.value) : 0,
                      is_risky: isRisky.value,
                      eligible_kid_ids: effectiveEligible(eligible.value),
                  }
                : {
                      title: title.value.trim(),
                      quest_title: questTitle.value.trim() || undefined,
                      chore_type: 'required' as const,
                      icon_emoji: emoji.value.trim() || undefined,
                      assigned_kid_id: assignedKid.value,
                      due_type: dueType.value,
                      gates_pay: gatesPay.value,
                      is_risky: isRisky.value,
                  };
        await authFetch<Chore>('/chores', { method: 'POST', body });
        title.value = '';
        questTitle.value = '';
        emoji.value = '';
        xp.value = null;
        isCustom.value = false;
        gatesPay.value = false;
        eligible.value = [];
        isRisky.value = false;
        riskyPrompt.value = null;
        riskyConfirmed.value = false;
        await loadAll();
    } catch (e) {
        error.value = apiMessage(e);
    }
    creating.value = false;
}

// --- edit an existing template (inline) ---
function startEdit(c: Chore) {
    editId.value = c.id;
    editType.value = c.chore_type;
    editTitle.value = c.title;
    editQuestTitle.value = c.quest_title ?? '';
    editEmoji.value = c.icon_emoji ?? '';
    editXp.value = c.value_cents || null;
    editAssignee.value = c.assigned_kid_id ?? '';
    editDue.value = c.due_type === 'end_of_week' ? 'end_of_week' : 'end_of_day';
    editGates.value = c.gates_pay;
    editEligible.value = c.eligible_kid_ids ? [...c.eligible_kid_ids] : [];
    editRisky.value = c.is_risky;
    editRiskyPrompt.value = null;
    editRiskyConfirmed.value = false;
    error.value = null;
}
function cancelEdit() {
    editId.value = null;
    editRiskyPrompt.value = null;
}
function confirmEditRisky() {
    editRiskyConfirmed.value = true;
    void saveEdit();
}
async function saveEdit() {
    if (!editId.value) return;
    error.value = null;
    if (!editTitle.value.trim()) {
        error.value = 'Give the chore a name.';
        return;
    }
    if (editType.value === 'required' && !editAssignee.value) {
        error.value = 'Pick which kid this required chore is for.';
        return;
    }
    const young = youngAffected(
        editRisky.value,
        editType.value,
        editAssignee.value,
        editEligible.value,
    );
    if (young.length && !editRiskyConfirmed.value) {
        editRiskyPrompt.value = young.map((k) => k.display_name).join(', ');
        return;
    }
    savingEdit.value = true;
    try {
        const body =
            editType.value === 'paid'
                ? {
                      title: editTitle.value.trim(),
                      quest_title: editQuestTitle.value.trim() || null,
                      icon_emoji: editEmoji.value.trim() || undefined,
                      value_cents:
                          editXp.value && editXp.value > 0
                              ? Math.round(editXp.value)
                              : 0,
                      is_risky: editRisky.value,
                      eligible_kid_ids: effectiveEligible(editEligible.value),
                  }
                : {
                      title: editTitle.value.trim(),
                      quest_title: editQuestTitle.value.trim() || null,
                      icon_emoji: editEmoji.value.trim() || undefined,
                      assigned_kid_id: editAssignee.value,
                      due_type: editDue.value,
                      gates_pay: editGates.value,
                      is_risky: editRisky.value,
                  };
        await authFetch(`/chores/${editId.value}`, { method: 'PATCH', body });
        editId.value = null;
        editRiskyPrompt.value = null;
        editRiskyConfirmed.value = false;
        await loadAll();
    } catch (e) {
        error.value = apiMessage(e);
    }
    savingEdit.value = false;
}

// Archive / unarchive a template (parent). Reuses PATCH /chores/:id { active }.
// Archived templates can't be spawned; unarchiving brings them back.
async function setArchived(id: string, archived: boolean) {
    error.value = null;
    archiveBusy.value = id;
    try {
        await authFetch(`/chores/${id}`, {
            method: 'PATCH',
            body: { active: !archived },
        });
        archivingId.value = null;
        if (editId.value === id) editId.value = null;
        await loadAll();
    } catch (e) {
        error.value = apiMessage(e);
    }
    archiveBusy.value = null;
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

// Remove an instance from the pool entirely (parent). Two-step confirm.
async function removeInstance(id: string) {
    error.value = null;
    busyId.value = id;
    try {
        await authFetch(`/chore-instances/${id}`, { method: 'DELETE' });
        removingId.value = null;
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

            <div class="tabs" role="tablist" aria-label="Chore type">
                <button
                    type="button"
                    class="tab"
                    :class="{ active: choreType === 'paid' }"
                    role="tab"
                    :aria-selected="choreType === 'paid'"
                    :tabindex="choreType === 'paid' ? 0 : -1"
                    @click="switchType('paid')"
                    @keydown="onTabKeys"
                >
                    💰 Paid
                </button>
                <button
                    type="button"
                    class="tab"
                    :class="{ active: choreType === 'required' }"
                    role="tab"
                    :aria-selected="choreType === 'required'"
                    :tabindex="choreType === 'required' ? 0 : -1"
                    @click="switchType('required')"
                    @keydown="onTabKeys"
                >
                    📌 Required
                </button>
            </div>

            <form @submit.prevent="createChore">
                <!-- PAID: gamified picker + XP -->
                <template v-if="choreType === 'paid'">
                    <ChorePicker @select="onPreset" />

                    <!-- Custom chore → name it yourself (+ optional fun name) -->
                    <template v-if="isCustom">
                        <mfp-input
                            label="Chore name"
                            name="customTitle"
                            placeholder="Name your chore"
                            :value.prop="title"
                            @input="
                                title = ($event.target as HTMLInputElement)
                                    .value
                            "
                        />
                        <mfp-input
                            label="Fun name kids see (optional)"
                            name="customQuestTitle"
                            placeholder="Defeat the dish goblins"
                            :value.prop="questTitle"
                            @input="
                                questTitle = ($event.target as HTMLInputElement)
                                    .value
                            "
                        />
                    </template>
                    <!-- Preset → the fun name kids see, plain name beneath -->
                    <div v-else-if="title" class="chosen">
                        <span class="chosen-emoji">{{ emoji || '📋' }}</span>
                        <span class="chosen-names">
                            <strong>{{ questTitle || title }}</strong>
                            <span v-if="questTitle" class="chosen-plain">{{
                                title
                            }}</span>
                        </span>
                    </div>

                    <div v-if="isCustom || title" class="row">
                        <div class="icon-col">
                            <span class="field-label">Icon</span>
                            <EmojiField v-model="emoji" />
                        </div>
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

                    <!-- §3b eligibility: which kids may claim it -->
                    <div
                        v-if="(isCustom || title) && kids.length"
                        class="field"
                    >
                        <span class="field-label">Who can claim this?</span>
                        <p class="muted small">
                            Leave all unchecked to let any kid claim it.
                        </p>
                        <label
                            v-for="k in kids"
                            :key="k.id"
                            class="check-field"
                        >
                            <input
                                v-model="eligible"
                                type="checkbox"
                                :value="k.id"
                            />
                            <span>{{ k.display_name }}</span>
                        </label>
                    </div>
                    <label v-if="isCustom || title" class="check-field">
                        <input v-model="isRisky" type="checkbox" />
                        <span
                            >⚠️ Risky — warn before making it available to a
                            young kid</span
                        >
                    </label>
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
                        <div class="icon-col">
                            <span class="field-label">Icon</span>
                            <EmojiField v-model="emoji" />
                        </div>
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
                    <label class="check-field">
                        <input v-model="isRisky" type="checkbox" />
                        <span
                            >⚠️ Risky — warn before assigning to a young
                            kid</span
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

                <!-- §3b soft confirmation before a risky chore reaches a young kid -->
                <div v-if="riskyPrompt" class="risky-confirm">
                    <span class="risky-q">
                        ⚠️ This chore is marked risky, and {{ riskyPrompt }} may
                        be under {{ RISKY_AGE }}. Make it available anyway?
                    </span>
                    <div class="risky-btns">
                        <mfp-button
                            variant="danger"
                            :disabled="creating"
                            @click="confirmRisky"
                        >
                            Add it anyway
                        </mfp-button>
                        <mfp-button variant="ghost" @click="riskyPrompt = null">
                            Cancel
                        </mfp-button>
                    </div>
                </div>
            </form>
        </section>

        <p v-if="loading" class="muted">Loading…</p>

        <!-- Templates -->
        <section v-if="!loading" class="card">
            <h2>Your chores</h2>
            <p v-if="!templates.length" class="muted">
                No chores yet — create your first one above.
            </p>
            <p v-else-if="!activeTemplates.length" class="muted">
                No active chores — they're all archived (see below).
            </p>
            <ul v-else class="list">
                <li v-for="c in activeTemplates" :key="c.id" class="tmpl-item">
                    <div class="item">
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
                        <button
                            class="notes-toggle"
                            aria-label="Edit chore"
                            title="Edit"
                            @click="
                                editId === c.id ? cancelEdit() : startEdit(c)
                            "
                        >
                            ✏️
                        </button>
                        <mfp-button
                            variant="secondary"
                            :disabled="busyId === c.id"
                            @click="addToPool(c.id)"
                        >
                            {{
                                c.chore_type === 'paid'
                                    ? 'Add to pool'
                                    : 'Assign'
                            }}
                        </mfp-button>
                    </div>

                    <!-- Inline edit -->
                    <div v-if="editId === c.id" class="edit-panel">
                        <mfp-input
                            label="Name"
                            name="editName"
                            :value.prop="editTitle"
                            @input="
                                editTitle = ($event.target as HTMLInputElement)
                                    .value
                            "
                        />
                        <mfp-input
                            label="Fun name kids see (optional)"
                            name="editQuestTitle"
                            :value.prop="editQuestTitle"
                            @input="
                                editQuestTitle = (
                                    $event.target as HTMLInputElement
                                ).value
                            "
                        />
                        <div class="row">
                            <div class="icon-col">
                                <span class="field-label">Icon</span>
                                <EmojiField v-model="editEmoji" />
                            </div>
                            <mfp-input
                                v-if="editType === 'paid'"
                                class="xp-in"
                                label="XP reward"
                                name="editXp"
                                type="number"
                                inputmode="numeric"
                                :value.prop="editXpDisplay"
                                @input="
                                    editXp =
                                        Number(
                                            ($event.target as HTMLInputElement)
                                                .value,
                                        ) || null
                                "
                            />
                            <label v-else class="field grow-field">
                                <span class="field-label">Assign to</span>
                                <select v-model="editAssignee" class="select">
                                    <option value="" disabled>
                                        Pick a kid…
                                    </option>
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
                        <template v-if="editType === 'required'">
                            <label class="field">
                                <span class="field-label">Due</span>
                                <select v-model="editDue" class="select">
                                    <option value="end_of_day">
                                        End of day
                                    </option>
                                    <option value="end_of_week">
                                        End of week
                                    </option>
                                </select>
                            </label>
                            <label class="check-field">
                                <input v-model="editGates" type="checkbox" />
                                <span
                                    >Gates pay — if missed, holds this week's
                                    earnings for review</span
                                >
                            </label>
                        </template>

                        <!-- §3b eligibility + risky (edit) -->
                        <div
                            v-if="editType === 'paid' && kids.length"
                            class="field"
                        >
                            <span class="field-label">Who can claim this?</span>
                            <p class="muted small">
                                Leave all unchecked to let any kid claim it.
                            </p>
                            <label
                                v-for="k in kids"
                                :key="k.id"
                                class="check-field"
                            >
                                <input
                                    v-model="editEligible"
                                    type="checkbox"
                                    :value="k.id"
                                />
                                <span>{{ k.display_name }}</span>
                            </label>
                        </div>
                        <label class="check-field">
                            <input v-model="editRisky" type="checkbox" />
                            <span
                                >⚠️ Risky — warn before making it available to a
                                young kid</span
                            >
                        </label>

                        <div class="edit-actions">
                            <mfp-button
                                variant="primary"
                                :disabled="savingEdit"
                                @click="saveEdit"
                            >
                                {{ savingEdit ? 'Saving…' : 'Save changes' }}
                            </mfp-button>
                            <mfp-button variant="ghost" @click="cancelEdit">
                                Cancel
                            </mfp-button>
                        </div>

                        <!-- §3b soft confirmation (edit) -->
                        <div v-if="editRiskyPrompt" class="risky-confirm">
                            <span class="risky-q">
                                ⚠️ This chore is marked risky, and
                                {{ editRiskyPrompt }} may be under
                                {{ RISKY_AGE }}. Save it anyway?
                            </span>
                            <div class="risky-btns">
                                <mfp-button
                                    variant="danger"
                                    :disabled="savingEdit"
                                    @click="confirmEditRisky"
                                >
                                    Save anyway
                                </mfp-button>
                                <mfp-button
                                    variant="ghost"
                                    @click="editRiskyPrompt = null"
                                >
                                    Cancel
                                </mfp-button>
                            </div>
                        </div>

                        <!-- Archive: soft-retire a chore without deleting it -->
                        <div class="archive-zone">
                            <button
                                v-if="archivingId !== c.id"
                                type="button"
                                class="archive-link"
                                @click="archivingId = c.id"
                            >
                                🗄️ Archive this chore
                            </button>
                            <div v-else class="archive-confirm">
                                <span class="archive-q">
                                    Archiving hides it from your list and the
                                    pool. You can unarchive it later.
                                </span>
                                <div class="archive-btns">
                                    <mfp-button
                                        variant="danger"
                                        :disabled="archiveBusy === c.id"
                                        @click="setArchived(c.id, true)"
                                    >
                                        {{
                                            archiveBusy === c.id
                                                ? 'Archiving…'
                                                : 'Archive'
                                        }}
                                    </mfp-button>
                                    <mfp-button
                                        variant="ghost"
                                        @click="archivingId = null"
                                    >
                                        Keep
                                    </mfp-button>
                                </div>
                            </div>
                        </div>
                    </div>
                </li>
            </ul>
        </section>

        <!-- Archived templates -->
        <section
            v-if="!loading && archivedTemplates.length"
            class="card archived-card"
        >
            <h2>🗄️ Archived</h2>
            <p class="muted small">
                Hidden from the pool. Unarchive to use a chore again.
            </p>
            <ul class="list">
                <li
                    v-for="c in archivedTemplates"
                    :key="c.id"
                    class="tmpl-item"
                >
                    <div class="item archived-item">
                        <span class="icon">{{ c.icon_emoji || '📋' }}</span>
                        <span class="grow">
                            <strong>{{ c.title }}</strong>
                            <span v-if="c.chore_type === 'paid'" class="xp"
                                >{{ c.value_cents }} XP</span
                            >
                            <span v-else class="req-sub">
                                Required · for {{ kidName(c.assigned_kid_id) }}
                            </span>
                        </span>
                        <mfp-button
                            variant="secondary"
                            :disabled="archiveBusy === c.id"
                            @click="setArchived(c.id, false)"
                        >
                            {{
                                archiveBusy === c.id
                                    ? 'Restoring…'
                                    : 'Unarchive'
                            }}
                        </mfp-button>
                    </div>
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
                        <button
                            class="notes-toggle"
                            aria-label="Remove from pool"
                            title="Remove from pool"
                            @click="
                                removingId = removingId === i.id ? null : i.id
                            "
                        >
                            🗑️
                        </button>
                    </div>

                    <!-- Confirm removing this instance from the pool -->
                    <div v-if="removingId === i.id" class="remove-bar">
                        <span class="remove-q">Remove this from the pool?</span>
                        <mfp-button
                            variant="danger"
                            :disabled="busyId === i.id"
                            @click="removeInstance(i.id)"
                        >
                            {{ busyId === i.id ? 'Removing…' : 'Remove' }}
                        </mfp-button>
                        <mfp-button variant="ghost" @click="removingId = null">
                            Cancel
                        </mfp-button>
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
.chosen-names {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}
.chosen-plain {
    font-size: 0.8rem;
    color: var(--color-text-muted);
}
.emoji-in {
    width: 5rem;
    flex: none;
}
.icon-col {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
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
.live-item,
.tmpl-item {
    display: flex;
    flex-direction: column;
}
.edit-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.5rem;
    padding: 0.75rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-brand-subtle, #efe7ff);
}
.edit-actions {
    display: flex;
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
.notes-toggle {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 1.1rem;
    padding: 0.2rem;
    line-height: 1;
}
.remove-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.4rem;
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-md, 0.75rem);
    background: #ffe9e9;
}
.remove-q {
    flex: 1;
    font-size: 0.9rem;
    font-weight: 700;
    color: #b3261e;
}
.archive-zone {
    border-top: 1px solid var(--color-surface-muted, #e6e0f5);
    padding-top: 0.6rem;
}
.archive-link {
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-text-muted);
    text-decoration: underline;
}
.archive-confirm {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.archive-q {
    font-size: 0.85rem;
    color: var(--color-text-muted);
}
.archive-btns {
    display: flex;
    gap: 0.5rem;
}
.archived-card {
    opacity: 0.9;
}
.archived-item {
    opacity: 0.7;
}
.risky-confirm {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius-md, 0.75rem);
    background: #fff4e0;
    border: 1px solid #ffd591;
}
.risky-q {
    font-size: 0.9rem;
    font-weight: 700;
    color: #a5510a;
}
.risky-btns {
    display: flex;
    gap: 0.5rem;
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
