import { describe, expect, it } from 'vitest';
import { makeBundles, type BundleItem } from './bundles';

function chore(
    id: string,
    xp: number,
    minutes: number,
    category: string | null,
): BundleItem {
    return { id, title: id, icon: null, xp, minutes, category };
}

// Chosen so each strategy picks a different set for a 600 XP target:
// fewest → a+b, fastest → d+b+c, balanced (one per category per round) → a+c.
const POOL: BundleItem[] = [
    chore('a', 500, 30, 'kitchen'),
    chore('b', 300, 5, 'kitchen'),
    chore('c', 200, 10, 'yard'),
    chore('d', 100, 1, 'yard'),
];

function ids(items: BundleItem[]): string[] {
    return items.map((i) => i.id);
}

describe('makeBundles', () => {
    it('returns fewest, fastest, and balanced bundles that reach the target', () => {
        const plan = makeBundles(POOL, 600);

        expect(plan.target).toBe(600);
        expect(plan.totalAvailable).toBe(1100);
        expect(plan.bundles.map((b) => b.key)).toEqual([
            'fewest',
            'fastest',
            'balanced',
        ]);
        expect(plan.bundles.every((b) => b.reachesTarget)).toBe(true);
    });

    it('takes the biggest rewards first for the fewest bundle', () => {
        const fewest = makeBundles(POOL, 600).bundles[0]!;

        expect(ids(fewest.items)).toEqual(['a', 'b']);
        expect(fewest.totalXp).toBe(800);
        expect(fewest.totalMinutes).toBe(35);
    });

    it('takes the quickest chores first for the fastest bundle', () => {
        const fastest = makeBundles(POOL, 600).bundles[1]!;

        expect(ids(fastest.items)).toEqual(['d', 'b', 'c']);
        expect(fastest.totalMinutes).toBe(16);
    });

    it('spreads the balanced bundle across categories', () => {
        const balanced = makeBundles(POOL, 600).bundles[2]!;

        expect(ids(balanced.items)).toEqual(['a', 'c']);
    });

    it('returns no bundles for an empty pool', () => {
        expect(makeBundles([], 600)).toEqual({
            bundles: [],
            totalAvailable: 0,
            target: 600,
        });
    });

    it('shows one bundle of everything, short of the target, when the pool is too small', () => {
        const plan = makeBundles(POOL, 5000);

        expect(plan.totalAvailable).toBe(1100);
        expect(plan.bundles).toHaveLength(1);
        expect(plan.bundles[0]!.items).toHaveLength(4);
        expect(plan.bundles[0]!.reachesTarget).toBe(false);
    });

    it('shows a plan only once when strategies pick the same chores', () => {
        const plan = makeBundles([chore('only', 1000, 10, 'yard')], 500);

        expect(plan.bundles).toHaveLength(1);
        expect(plan.bundles[0]!.key).toBe('fewest');
    });
});
