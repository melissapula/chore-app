import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pace } from './pace';

// pace() measures to 23:59:59 local time on the deadline day. Freezing "now" at
// that same local time makes the weeks remaining a whole number.
const NOW = new Date(2026, 9, 17, 23, 59, 59); // 2026-10-17, local

describe('pace', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('splits the XP still needed across the weeks left', () => {
        const result = pace(1000, 200, '2026-10-31', 400);

        expect(result).toEqual({
            perWeek: 400,
            weeksLeft: 2,
            signal: 'green',
            message: '~400 XP/week · 2 weeks left',
        });
    });

    it('rounds the weekly amount up', () => {
        expect(pace(1001, 0, '2026-10-31', 0).perWeek).toBe(501);
    });

    it('is green when the weekly rate meets the pace', () => {
        expect(pace(1000, 200, '2026-10-31', 400).signal).toBe('green');
    });

    it('is yellow from 60% of the pace up to just under it', () => {
        expect(pace(1000, 200, '2026-10-31', 399).signal).toBe('yellow');
        expect(pace(1000, 200, '2026-10-31', 240).signal).toBe('yellow');
    });

    it('is red below 60% of the pace', () => {
        expect(pace(1000, 200, '2026-10-31', 239).signal).toBe('red');
    });

    it('uses the singular for one week left', () => {
        const result = pace(1000, 200, '2026-10-24', 0);

        expect(result.weeksLeft).toBe(1);
        expect(result.message).toBe('~800 XP/week · 1 week left');
    });

    it('counts a deadline of today as one week', () => {
        expect(pace(1000, 200, '2026-10-17', 0)).toMatchObject({
            weeksLeft: 1,
            perWeek: 800,
        });
    });

    it('is red with the full shortfall once the deadline has passed', () => {
        const result = pace(1000, 200, '2026-10-16', 10_000);

        expect(result).toEqual({
            perWeek: 800,
            weeksLeft: 0,
            signal: 'red',
            message: 'Deadline passed — 800 XP short',
        });
    });

    it('is ready when spendable XP already covers the target', () => {
        const expected = {
            perWeek: 0,
            weeksLeft: 0,
            signal: 'ready',
            message: 'Ready!',
        };

        expect(pace(1000, 1000, '2026-10-31', 0)).toEqual(expected);
        expect(pace(1000, 5000, '2026-10-16', 0)).toEqual(expected);
    });
});
