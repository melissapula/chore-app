<script setup lang="ts">
// A parent↔kid note thread on one chore instance (SPEC §4 notes, §6 emojis).
// Notes are RLS-scoped: a parent sees all household notes; a kid sees notes they
// authored or received. We set recipient_id to the chore's kid so the kid always
// sees the thread on their own chore (and siblings never see it).
const props = defineProps<{
    instanceId: string;
    /** The kid on this chore (claimed_by / assigned_to) — the note recipient. */
    subjectKidId: string | null;
}>();

const supabase = useSupabaseClient();

interface Note {
    id: string;
    author_id: string;
    body: string;
    created_at: string;
}

const uid = ref<string | null>(null);
const householdId = ref<string | null>(null);
const names = ref<Record<string, string>>({});
const notes = ref<Note[]>([]);
const text = ref('');
const loading = ref(true);
const posting = ref(false);
const error = ref<string | null>(null);

const QUICK = ['👍', '🎉', '⭐', '❤️', '😅', '🙏'];

function authorName(id: string): string {
    if (id === uid.value) return 'You';
    return names.value[id] || 'Someone';
}
function timeOf(iso: string): string {
    return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
}

async function loadNotes() {
    const { data, error: err } = await supabase
        .from('notes')
        .select('id, author_id, body, created_at')
        .eq('chore_instance_id', props.instanceId)
        .order('created_at', { ascending: true });
    if (err) error.value = err.message;
    else notes.value = (data ?? []) as Note[];
}

async function post(body: string) {
    const trimmed = body.trim();
    if (!trimmed || !householdId.value || !uid.value) return;
    posting.value = true;
    error.value = null;
    const { error: err } = await supabase.from('notes').insert({
        household_id: householdId.value,
        chore_instance_id: props.instanceId,
        author_id: uid.value,
        recipient_id: props.subjectKidId,
        body: trimmed,
    });
    posting.value = false;
    if (err) {
        error.value = err.message;
        return;
    }
    text.value = '';
    await loadNotes();
}

onMounted(async () => {
    const { data } = await supabase.auth.getUser();
    uid.value = data.user?.id ?? null;
    const [meRes, memRes] = await Promise.all([
        supabase
            .from('users')
            .select('household_id')
            .eq('id', uid.value)
            .maybeSingle(),
        supabase.from('users').select('id, display_name'),
    ]);
    householdId.value =
        (meRes.data as { household_id?: string } | null)?.household_id ?? null;
    const map: Record<string, string> = {};
    for (const u of (memRes.data ?? []) as {
        id: string;
        display_name: string;
    }[]) {
        map[u.id] = u.display_name;
    }
    names.value = map;
    await loadNotes();
    loading.value = false;
});
</script>

<template>
    <div class="thread">
        <p v-if="loading" class="muted small">Loading notes…</p>
        <template v-else>
            <ul v-if="notes.length" class="msgs">
                <li
                    v-for="n in notes"
                    :key="n.id"
                    class="msg"
                    :class="{ mine: n.author_id === uid }"
                >
                    <span class="bubble">{{ n.body }}</span>
                    <span class="meta"
                        >{{ authorName(n.author_id) }} ·
                        {{ timeOf(n.created_at) }}</span
                    >
                </li>
            </ul>
            <p v-else class="muted small">No notes yet — say something nice!</p>

            <div class="quick">
                <button
                    v-for="e in QUICK"
                    :key="e"
                    type="button"
                    class="emoji"
                    :disabled="posting"
                    @click="post(e)"
                >
                    {{ e }}
                </button>
            </div>

            <form class="composer" @submit.prevent="post(text)">
                <mfp-input
                    label=""
                    name="note"
                    placeholder="Add a note…"
                    :value.prop="text"
                    @input="text = ($event.target as HTMLInputElement).value"
                />
                <mfp-button
                    type="submit"
                    variant="secondary"
                    :disabled="posting || !text.trim()"
                >
                    Send
                </mfp-button>
            </form>

            <p v-if="error" class="muted small err">{{ error }}</p>
        </template>
    </div>
</template>

<style scoped>
.thread {
    margin-top: 0.5rem;
    padding: 0.6rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-surface-muted, #e6e0f5);
}
.muted {
    color: var(--color-text-muted);
}
.small {
    font-size: 0.8rem;
}
.err {
    color: #b3261e;
}
.msgs {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}
.msg {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 85%;
}
.msg.mine {
    align-self: flex-end;
    align-items: flex-end;
}
.bubble {
    padding: 0.4rem 0.7rem;
    border-radius: 0.9rem;
    background: var(--color-surface-muted, #f0edf7);
    font-size: 0.9rem;
    line-height: 1.3;
    word-break: break-word;
}
.msg.mine .bubble {
    background: var(--color-brand-subtle, #efe7ff);
}
.meta {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    margin-top: 0.1rem;
}
.quick {
    display: flex;
    gap: 0.3rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
}
.emoji {
    font-size: 1.1rem;
    line-height: 1;
    padding: 0.3rem 0.45rem;
    border: 1px solid var(--color-surface-muted, #e6e0f5);
    border-radius: 999px;
    background: var(--color-surface, #fff);
    cursor: pointer;
}
.emoji:hover {
    background: var(--color-surface-muted, #f5f3f7);
}
.composer {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
}
.composer :deep(mfp-input) {
    flex: 1;
}
</style>
