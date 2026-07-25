// Weekly bundle engine (SPEC §5). Given a target XP and the chores currently
// available to claim, generate a few labelled bundles that hit/exceed the
// target. At family scale (a couple dozen chores) this is a trivial greedy
// generator — no real subset-sum needed.

export interface BundleItem {
    id: string;
    title: string;
    icon: string | null;
    xp: number;
    minutes: number; // 0 when the template has no estimate
    category: string | null;
}

export interface Bundle {
    key: 'fewest' | 'fastest' | 'balanced';
    label: string;
    hint: string;
    items: BundleItem[];
    totalXp: number;
    totalMinutes: number;
    reachesTarget: boolean;
}

export interface BundlePlan {
    bundles: Bundle[];
    /** Total XP claimable right now — if < target, no bundle can reach it. */
    totalAvailable: number;
    target: number;
}

function greedy(
    items: BundleItem[],
    target: number,
    cmp: (a: BundleItem, b: BundleItem) => number,
): BundleItem[] {
    const sorted = [...items].sort(cmp);
    const picked: BundleItem[] = [];
    let sum = 0;
    for (const it of sorted) {
        if (sum >= target) break;
        picked.push(it);
        sum += it.xp;
    }
    return picked;
}

// Round-robin across categories so the bundle spreads out instead of stacking
// one category.
function balanced(items: BundleItem[], target: number): BundleItem[] {
    const buckets = new Map<string, BundleItem[]>();
    for (const it of items) {
        const k = it.category || 'other';
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k)!.push(it);
    }
    for (const arr of buckets.values()) arr.sort((a, b) => b.xp - a.xp);
    const lists = [...buckets.values()];

    const picked: BundleItem[] = [];
    let sum = 0;
    let progressed = true;
    while (sum < target && progressed) {
        progressed = false;
        for (const list of lists) {
            if (sum >= target) break;
            const it = list.shift();
            if (it) {
                picked.push(it);
                sum += it.xp;
                progressed = true;
            }
        }
    }
    return picked;
}

function summarize(
    key: Bundle['key'],
    label: string,
    hint: string,
    items: BundleItem[],
    target: number,
): Bundle {
    const totalXp = items.reduce((s, i) => s + i.xp, 0);
    const totalMinutes = items.reduce((s, i) => s + i.minutes, 0);
    return {
        key,
        label,
        hint,
        items,
        totalXp,
        totalMinutes,
        reachesTarget: totalXp >= target,
    };
}

function signature(b: Bundle): string {
    return b.items
        .map((i) => i.id)
        .sort()
        .join(',');
}

export function makeBundles(items: BundleItem[], target: number): BundlePlan {
    const totalAvailable = items.reduce((s, i) => s + i.xp, 0);

    const candidates: Bundle[] = [
        summarize(
            'fewest',
            'Fewest chores',
            'Biggest rewards first',
            greedy(items, target, (a, b) => b.xp - a.xp),
            target,
        ),
        summarize(
            'fastest',
            'Fastest',
            'Least time',
            greedy(
                items,
                target,
                (a, b) => a.minutes - b.minutes || b.xp - a.xp,
            ),
            target,
        ),
        summarize(
            'balanced',
            'Balanced',
            'A mix of chores',
            balanced(items, target),
            target,
        ),
    ];

    // Different strategies often converge on a small pool — show each distinct
    // plan once.
    const seen = new Set<string>();
    const bundles = candidates.filter((b) => {
        const sig = signature(b);
        if (seen.has(sig) || b.items.length === 0) return false;
        seen.add(sig);
        return true;
    });

    return { bundles, totalAvailable, target };
}
