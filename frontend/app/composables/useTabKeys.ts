/**
 * ARIA tabs keyboard support (audit #15). Our tab strips had role="tab" +
 * aria-selected but weren't keyboard-operable. Pair this with a roving tabindex
 * (`:tabindex="current === value ? 0 : -1"`) on each tab button and wire the
 * returned handler to `@keydown`. Arrow keys / Home / End move selection and
 * focus, matching the WAI-ARIA tabs pattern.
 */
import type { Ref } from 'vue';

export function useTabKeys<T>(
    tabs: readonly T[],
    current: Ref<T>,
    select: (t: T) => void,
) {
    return (e: KeyboardEvent) => {
        const i = tabs.indexOf(current.value);
        if (i < 0) return;
        let next: number;
        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                next = (i + 1) % tabs.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                next = (i - 1 + tabs.length) % tabs.length;
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = tabs.length - 1;
                break;
            default:
                return;
        }
        e.preventDefault();
        select(tabs[next]!);
        const strip = (e.currentTarget as HTMLElement).closest(
            '[role=tablist]',
        );
        const btn = strip?.querySelectorAll<HTMLElement>('[role=tab]')[next];
        btn?.focus();
    };
}
