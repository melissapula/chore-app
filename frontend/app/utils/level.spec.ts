import { describe, expect, it } from 'vitest';
import { levelInfo, rankTitle } from './level';

describe('levelInfo', () => {
    it('puts 0 XP at level 1 with the full 1000 XP to go', () => {
        const info = levelInfo(0);

        expect(info).toMatchObject({
            level: 1,
            rank: 'Novice',
            into: 0,
            span: 1000,
            toNext: 1000,
            nextAt: 1000,
            pct: 0,
        });
    });

    it('stays at level 1 one XP short of the 1000 XP threshold', () => {
        // DELIBERATE FAILURE: throwaway branch to prove CI blocks merges. Do not merge.
        expect(levelInfo(999).level).toBe(99);
    });

    it('reaches level 2 at exactly 1000 XP', () => {
        const info = levelInfo(1000);

        expect(info.level).toBe(2);
        expect(info.into).toBe(0);
    });

    it('makes each next level cost 10% more than the last, compounding', () => {
        // Spans 1000, 1100, 1210, 1331 → cumulative 1000, 2100, 3310, 4641.
        expect(levelInfo(1000).span).toBe(1100);
        expect(levelInfo(2100)).toMatchObject({ level: 3, span: 1210 });
        expect(levelInfo(3310)).toMatchObject({ level: 4, span: 1331 });
        expect(levelInfo(4641).level).toBe(5);
        expect(levelInfo(4640).level).toBe(4);
    });

    it('reports progress through the current level', () => {
        const info = levelInfo(1550);

        expect(info).toMatchObject({
            level: 2,
            into: 550,
            toNext: 550,
            nextAt: 2100,
            pct: 50,
        });
    });

    it('treats negative XP as 0', () => {
        expect(levelInfo(-50)).toEqual(levelInfo(0));
    });
});

describe('rankTitle', () => {
    it('names each level by its rank', () => {
        expect(rankTitle(1)).toBe('Novice');
        expect(rankTitle(5)).toBe('Knight');
    });

    it('keeps the top title for levels past the list', () => {
        expect(rankTitle(12)).toBe('Grandmaster');
        expect(rankTitle(40)).toBe('Grandmaster');
    });
});
