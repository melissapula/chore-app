<script setup lang="ts">
// Compact emoji picker for a chore icon. A small trigger shows the current emoji;
// clicking opens a grid of chore/household-flavored emojis, and there's a field
// to type any emoji the grid doesn't have. v-model binds the chosen emoji string.
const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

// A broad, household/kid-friendly set (cleaning, kitchen, outdoor, pets, school,
// tools, misc). Not exhaustive — the "type your own" field covers the rest.
const EMOJIS = [
    '🧹',
    '🧺',
    '🧼',
    '🧽',
    '🧴',
    '🪣',
    '🚿',
    '🛁',
    '🚽',
    '🧻',
    '🪥',
    '🪒',
    '🗑️',
    '♻️',
    '🧯',
    '🧦',
    '👕',
    '🩳',
    '👚',
    '🧷',
    '🪡',
    '🛏️',
    '🧸',
    '🛋️',
    '🪑',
    '🚪',
    '🪟',
    '💡',
    '🔌',
    '🔋',
    '🍽️',
    '🍴',
    '🥄',
    '🔪',
    '🍳',
    '🥣',
    '🫕',
    '🧊',
    '☕',
    '🥤',
    '🍞',
    '🥫',
    '🧂',
    '🧇',
    '🌱',
    '🪴',
    '🌷',
    '🌳',
    '🍂',
    '🍁',
    '🌿',
    '🌻',
    '🪵',
    '🧱',
    '⛏️',
    '🪜',
    '🐶',
    '🐕',
    '🐱',
    '🐟',
    '🐹',
    '🐰',
    '🦴',
    '🐾',
    '🐦',
    '🚗',
    '🚲',
    '🛻',
    '⛽',
    '🧰',
    '🔧',
    '🔨',
    '🪛',
    '🔩',
    '📚',
    '✏️',
    '🖍️',
    '🎒',
    '🧩',
    '🎨',
    '🖌️',
    '📦',
    '📮',
    '📋',
    '🗂️',
    '🛒',
    '🧾',
    '💵',
    '🔥',
    '💧',
    '⭐',
    '✅',
    '⏰',
    '🎯',
    '🧠',
    '💪',
];

const open = ref(false);
const root = ref<HTMLElement | null>(null);

function pick(e: string) {
    emit('update:modelValue', e);
    open.value = false;
}
function onType(e: Event) {
    emit('update:modelValue', (e.target as HTMLInputElement).value);
}
function onDoc(e: MouseEvent) {
    if (root.value && !root.value.contains(e.target as Node))
        open.value = false;
}
onMounted(() => document.addEventListener('mousedown', onDoc));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc));
</script>

<template>
    <div ref="root" class="emoji-field">
        <button
            type="button"
            class="trigger"
            :aria-label="'Pick an icon'"
            @click="open = !open"
        >
            <span class="cur">{{ props.modelValue || '➕' }}</span>
        </button>

        <div v-if="open" class="pop">
            <div class="grid">
                <button
                    v-for="e in EMOJIS"
                    :key="e"
                    type="button"
                    class="e"
                    :class="{ sel: e === props.modelValue }"
                    @click="pick(e)"
                >
                    {{ e }}
                </button>
            </div>
            <input
                class="own"
                type="text"
                maxlength="8"
                placeholder="…or type/paste any emoji"
                :value="props.modelValue"
                @input="onType"
            />
        </div>
    </div>
</template>

<style scoped>
.emoji-field {
    position: relative;
}
.trigger {
    width: 3.25rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    border: 2px solid var(--color-surface-muted, #e6e2ef);
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface, #fff);
    cursor: pointer;
}
.trigger:hover {
    border-color: var(--color-brand-primary, #6c4ce0);
}
.cur {
    line-height: 1;
}
.pop {
    position: absolute;
    z-index: 30;
    top: calc(100% + 0.25rem);
    left: 0;
    width: 18rem;
    max-width: 78vw;
    padding: 0.5rem;
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-surface-muted, #e6e2ef);
    border-radius: var(--radius-md, 0.75rem);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 0.15rem;
    max-height: 12rem;
    overflow: hidden auto;
}
.grid .e {
    aspect-ratio: 1;
    font-size: 1.15rem;
    line-height: 1;
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 0.5rem);
    background: none;
    cursor: pointer;
}
.grid .e:hover {
    background: var(--color-brand-subtle, #efe7ff);
}
.grid .e.sel {
    border-color: var(--color-brand-primary, #6c4ce0);
    background: var(--color-brand-subtle, #efe7ff);
}
.own {
    width: 100%;
    box-sizing: border-box;
    margin-top: 0.5rem;
    padding: 0.4rem 0.6rem;
    font: inherit;
    border: 2px solid var(--color-surface-muted, #e6e2ef);
    border-radius: var(--radius-sm, 0.5rem);
    background: var(--color-surface, #fff);
}
.own:focus {
    outline: none;
    border-color: var(--color-brand-primary, #6c4ce0);
}
</style>
