<script setup lang="ts">
// Reusable avatar picker in a <mfp-modal>. Two modes:
//   • Emoji  — curated, kid/RPG-flavored grid
//   • Upload — pick an image; downscaled client-side to a small JPEG data URL
//              (no Supabase Storage needed at family scale; see 0004 migration)
// Bound with:
//   v-model        → AvatarValue | null  (update:modelValue)
//   v-model:open   → modal visibility    (update:open)
import type { AvatarValue } from '~/types/avatar';

const props = defineProps<{
    open: boolean;
    modelValue: AvatarValue | null;
}>();

const emit = defineEmits<{
    'update:open': [boolean];
    'update:modelValue': [AvatarValue];
}>();

const EMOJIS = [
    '🦸',
    '🦹',
    '🧙',
    '🧚',
    '🧛',
    '🧝',
    '🧞',
    '🥷',
    '🤴',
    '👸',
    '🧑‍🚀',
    '🧑‍🎤',
    '🐶',
    '🐱',
    '🦊',
    '🐻',
    '🐼',
    '🦁',
    '🐯',
    '🐸',
    '🐵',
    '🦄',
    '🐲',
    '🐧',
    '🦉',
    '🐙',
    '🦖',
    '🦕',
    '😀',
    '😎',
    '🤩',
    '🥳',
    '😺',
    '🤠',
    '🤖',
    '👾',
    '👽',
    '🎃',
    '⚔️',
    '🛡️',
    '🏆',
    '👑',
    '⭐',
    '🌟',
    '🔥',
    '⚡',
    '🚀',
    '🌈',
];

const mode = ref<'emoji' | 'upload'>('emoji');
const selectedEmoji = ref('');
const uploadedDataUrl = ref('');
const uploadError = ref<string | null>(null);

// (Re)sync from the bound value each time the modal opens.
watch(
    () => props.open,
    (isOpen) => {
        if (!isOpen) return;
        uploadError.value = null;
        const v = props.modelValue;
        if (v?.kind === 'image') {
            mode.value = 'upload';
            uploadedDataUrl.value = v.dataUrl;
            selectedEmoji.value = '';
        } else {
            mode.value = 'emoji';
            selectedEmoji.value = v?.kind === 'emoji' ? v.emoji : '';
            uploadedDataUrl.value = '';
        }
    },
);

function pickEmoji(emoji: string) {
    selectedEmoji.value = emoji;
}

function onFile(e: Event) {
    uploadError.value = null;
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        uploadError.value = 'Please choose an image file.';
        return;
    }
    const reader = new FileReader();
    reader.onerror = () => (uploadError.value = 'Could not read that file.');
    reader.onload = () => {
        const img = new Image();
        img.onerror = () =>
            (uploadError.value = 'That image could not be loaded.');
        img.onload = () => {
            // Downscale to a small square-ish thumbnail so the data URL stays tiny.
            const MAX = 160;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                uploadError.value = 'Image processing is not supported here.';
                return;
            }
            ctx.drawImage(img, 0, 0, w, h);
            uploadedDataUrl.value = canvas.toDataURL('image/jpeg', 0.85);
        };
        img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
}

const canSave = computed(() =>
    mode.value === 'emoji' ? !!selectedEmoji.value : !!uploadedDataUrl.value,
);

function save() {
    if (mode.value === 'emoji' && selectedEmoji.value) {
        emit('update:modelValue', {
            kind: 'emoji',
            emoji: selectedEmoji.value,
        });
    } else if (mode.value === 'upload' && uploadedDataUrl.value) {
        emit('update:modelValue', {
            kind: 'image',
            dataUrl: uploadedDataUrl.value,
        });
    }
    emit('update:open', false);
}

function close() {
    emit('update:open', false);
}
</script>

<template>
    <mfp-modal :open="open" size="md" @close="close">
        <template #header>
            <span>Choose your avatar</span>
        </template>

        <div class="preview">
            <div class="avatar-circle">
                <img
                    v-if="mode === 'upload' && uploadedDataUrl"
                    :src="uploadedDataUrl"
                    alt="Avatar preview"
                />
                <span v-else>{{ selectedEmoji || '🙂' }}</span>
            </div>
        </div>

        <div class="tabs" role="tablist">
            <button
                type="button"
                class="tab"
                :class="{ active: mode === 'emoji' }"
                role="tab"
                :aria-selected="mode === 'emoji'"
                @click="mode = 'emoji'"
            >
                Emoji
            </button>
            <button
                type="button"
                class="tab"
                :class="{ active: mode === 'upload' }"
                role="tab"
                :aria-selected="mode === 'upload'"
                @click="mode = 'upload'"
            >
                Upload photo
            </button>
        </div>

        <div
            v-if="mode === 'emoji'"
            class="grid"
            role="listbox"
            aria-label="Avatar options"
        >
            <button
                v-for="emoji in EMOJIS"
                :key="emoji"
                type="button"
                class="emoji"
                :class="{ active: emoji === selectedEmoji }"
                role="option"
                :aria-selected="emoji === selectedEmoji"
                @click="pickEmoji(emoji)"
            >
                {{ emoji }}
            </button>
        </div>

        <div v-else class="upload">
            <label class="upload-drop">
                <input type="file" accept="image/*" @change="onFile" />
                <span>{{
                    uploadedDataUrl
                        ? 'Choose a different photo'
                        : 'Tap to choose a photo'
                }}</span>
            </label>
            <p class="upload-hint">
                Stored small and square-cropped to a thumbnail. JPG, PNG, or
                GIF.
            </p>
            <mfp-alert v-if="uploadError" variant="error">{{
                uploadError
            }}</mfp-alert>
        </div>

        <template #footer>
            <div class="actions">
                <mfp-button variant="ghost" @click="close">Cancel</mfp-button>
                <mfp-button
                    variant="primary"
                    :disabled="!canSave"
                    @click="save"
                >
                    Save avatar
                </mfp-button>
            </div>
        </template>
    </mfp-modal>
</template>

<style scoped>
.preview {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
}
.avatar-circle {
    width: 5rem;
    height: 5rem;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.75rem;
    background: var(--color-brand-subtle, #efe7ff);
    box-shadow: inset 0 0 0 3px var(--color-brand-primary, #6c4ce0);
}
.avatar-circle img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 1rem;
    border-bottom: 2px solid var(--color-surface-muted, #f5f3f7);
}
.tab {
    flex: 1;
    padding: 0.5rem;
    border: none;
    background: none;
    font: inherit;
    font-weight: 700;
    color: var(--color-text-muted, #6b6672);
    cursor: pointer;
    border-bottom: 3px solid transparent;
    margin-bottom: -2px;
}
.tab.active {
    color: var(--color-brand-primary, #6c4ce0);
    border-bottom-color: var(--color-brand-primary, #6c4ce0);
}
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(2.75rem, 1fr));
    gap: 0.4rem;
}
.emoji {
    aspect-ratio: 1;
    font-size: 1.6rem;
    line-height: 1;
    border: 2px solid transparent;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--color-surface-muted, #f5f3f7);
    cursor: pointer;
    transition:
        transform 0.08s ease,
        border-color 0.08s ease;
}
.emoji:hover {
    transform: scale(1.12);
}
.emoji.active {
    border-color: var(--color-brand-primary, #6c4ce0);
    background: var(--color-brand-subtle, #efe7ff);
}
.upload-drop {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 6rem;
    padding: 1rem;
    text-align: center;
    border: 2px dashed var(--color-brand-primary, #6c4ce0);
    border-radius: var(--radius-md, 0.75rem);
    color: var(--color-brand-primary, #6c4ce0);
    font-weight: 700;
    cursor: pointer;
}
.upload-drop input {
    display: none;
}
.upload-hint {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
    color: var(--color-text-muted, #6b6672);
}
.actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
}
</style>
