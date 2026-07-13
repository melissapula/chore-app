<script setup lang="ts">
// Searchable chore picker. Common chores come pre-gamified (a quest-flavored
// name kids see) with the plain name kept for search + a subtitle hint. Typing
// filters on both; when nothing matches, offers "Create custom chore" using
// whatever was typed. Emits `select`; the parent form fills from it.
export interface ChorePreset {
    title: string; // gamified, quest-flavored name (what kids see)
    plain: string; // plain name — for search + a subtitle hint
    emoji: string;
    xp: number;
}

const emit = defineEmits<{ select: [ChorePreset] }>();

// Suggested XP ≈ effort; 1 XP = 1¢, so it doubles as a starting reward.
const COMMON: ChorePreset[] = [
    {
        title: 'Tame the bed-beast',
        plain: 'Make your bed',
        emoji: '🛏️',
        xp: 10,
    },
    {
        title: 'Defeat the dish goblins',
        plain: 'Do the dishes',
        emoji: '🍽️',
        xp: 30,
    },
    {
        title: 'Load the dish-catapult',
        plain: 'Load the dishwasher',
        emoji: '🍽️',
        xp: 25,
    },
    {
        title: 'Free the dishes from the dungeon',
        plain: 'Unload the dishwasher',
        emoji: '🍽️',
        xp: 25,
    },
    {
        title: 'Banish the trash to the wastelands',
        plain: 'Take out the trash',
        emoji: '🗑️',
        xp: 20,
    },
    {
        title: 'Send scraps to the reforge',
        plain: 'Take out the recycling',
        emoji: '♻️',
        xp: 20,
    },
    {
        title: 'Sweep the floor for booby traps',
        plain: 'Sweep the floor',
        emoji: '🧹',
        xp: 30,
    },
    {
        title: 'Vanquish the dust monsters',
        plain: 'Vacuum',
        emoji: '🧹',
        xp: 40,
    },
    { title: 'Dust the ancient relics', plain: 'Dust', emoji: '🪶', xp: 25 },
    {
        title: 'Wipe out the counter grime',
        plain: 'Wipe the counters',
        emoji: '🧽',
        xp: 20,
    },
    {
        title: 'Cleanse the porcelain throne',
        plain: 'Clean the bathroom',
        emoji: '🚽',
        xp: 60,
    },
    {
        title: 'Reclaim your room from chaos',
        plain: 'Clean your room',
        emoji: '🧸',
        xp: 50,
    },
    {
        title: 'Set the feasting table',
        plain: 'Set the table',
        emoji: '🍴',
        xp: 15,
    },
    {
        title: 'Clear the battlefield',
        plain: 'Clear the table',
        emoji: '🧼',
        xp: 15,
    },
    {
        title: 'Feed the loyal beast',
        plain: 'Feed the pet',
        emoji: '🐶',
        xp: 15,
    },
    {
        title: 'Walk the hound on patrol',
        plain: 'Walk the dog',
        emoji: '🐕',
        xp: 40,
    },
    {
        title: 'Conquer the laundry mountain',
        plain: 'Do the laundry',
        emoji: '🧺',
        xp: 40,
    },
    {
        title: 'Marshal the laundry legion',
        plain: 'Fold the laundry',
        emoji: '🧦',
        xp: 30,
    },
    {
        title: 'Water the enchanted garden',
        plain: 'Water the plants',
        emoji: '🪴',
        xp: 15,
    },
    {
        title: 'Mow the endless meadow',
        plain: 'Mow the lawn',
        emoji: '🌱',
        xp: 80,
    },
    {
        title: 'Rake the fallen-leaf horde',
        plain: 'Rake the leaves',
        emoji: '🍂',
        xp: 60,
    },
    {
        title: 'Wash the family chariot',
        plain: 'Wash the car',
        emoji: '🚗',
        xp: 70,
    },
    {
        title: 'Polish the castle windows',
        plain: 'Clean the windows',
        emoji: '🪟',
        xp: 40,
    },
    {
        title: 'Organize the toy armory',
        plain: 'Organize the toys',
        emoji: '🧸',
        xp: 30,
    },
];

const query = ref('');
const open = ref(false);
const root = ref<HTMLElement | null>(null);

const filtered = computed(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) return COMMON;
    return COMMON.filter(
        (c) =>
            c.title.toLowerCase().includes(q) ||
            c.plain.toLowerCase().includes(q),
    );
});

function choose(preset: ChorePreset) {
    emit('select', preset);
    query.value = '';
    open.value = false;
}

function createCustom() {
    const title = query.value.trim();
    if (!title) return;
    emit('select', { title, plain: title, emoji: '', xp: 0 });
    query.value = '';
    open.value = false;
}

function onDocPointer(e: MouseEvent) {
    if (root.value && !root.value.contains(e.target as Node)) {
        open.value = false;
    }
}
onMounted(() => document.addEventListener('mousedown', onDocPointer));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocPointer));
</script>

<template>
    <div ref="root" class="combo">
        <label class="lbl">Pick a chore</label>
        <input
            class="search"
            type="text"
            :value="query"
            placeholder="Search chores…"
            autocomplete="off"
            @focus="open = true"
            @input="
                query = ($event.target as HTMLInputElement).value;
                open = true;
            "
        />

        <div v-if="open" class="menu">
            <ul v-if="filtered.length" class="opts">
                <li v-for="c in filtered" :key="c.title">
                    <button type="button" class="opt" @click="choose(c)">
                        <span class="e">{{ c.emoji }}</span>
                        <span class="t">
                            <span class="quest">{{ c.title }}</span>
                            <span class="plain">{{ c.plain }}</span>
                        </span>
                        <span class="x">{{ c.xp }} XP</span>
                    </button>
                </li>
            </ul>
            <div v-else class="empty">
                <p class="no">No matches for "{{ query }}".</p>
                <mfp-button variant="primary" @click="createCustom">
                    Create custom chore
                </mfp-button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.combo {
    position: relative;
}
.lbl {
    display: block;
    font-weight: 700;
    font-size: 0.9rem;
    margin-bottom: 0.3rem;
}
.search {
    width: 100%;
    box-sizing: border-box;
    padding: 0.6rem 0.75rem;
    font: inherit;
    border: 2px solid var(--color-surface-muted, #e6e2ef);
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface, #fff);
    color: var(--color-text-default);
}
.search:focus {
    outline: none;
    border-color: var(--color-brand-primary, #6c4ce0);
}
.menu {
    position: absolute;
    z-index: 20;
    top: calc(100% + 0.25rem);
    left: 0;
    right: 0;
    max-height: 18rem;
    overflow-y: auto;
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-surface-muted, #e6e2ef);
    border-radius: var(--radius-md, 0.75rem);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.opts {
    list-style: none;
    margin: 0;
    padding: 0.25rem;
}
.opt {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem;
    border: none;
    background: none;
    font: inherit;
    text-align: left;
    border-radius: var(--radius-sm, 0.5rem);
    cursor: pointer;
}
.opt:hover {
    background: var(--color-brand-subtle, #efe7ff);
}
.opt .e {
    font-size: 1.35rem;
}
.opt .t {
    flex: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}
.opt .quest {
    font-weight: 700;
}
.opt .plain {
    font-size: 0.78rem;
    color: var(--color-text-muted, #6b6672);
}
.opt .x {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--color-brand-primary, #6c4ce0);
    white-space: nowrap;
}
.empty {
    padding: 1rem;
    text-align: center;
}
.no {
    margin: 0 0 0.75rem;
    color: var(--color-text-muted, #6b6672);
}
</style>
