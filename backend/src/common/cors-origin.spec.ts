import { toCorsOrigin } from './cors-origin';

describe('toCorsOrigin', () => {
    it.each([
        ['a bare origin', 'https://chore-app-delta.vercel.app'],
        ['a trailing slash', 'https://chore-app-delta.vercel.app/'],
        ['surrounding whitespace', '  https://chore-app-delta.vercel.app  '],
        ['a stray path', 'https://chore-app-delta.vercel.app/login'],
    ])('returns the browser Origin form for %s', (_label, raw) => {
        expect(toCorsOrigin(raw)).toBe('https://chore-app-delta.vercel.app');
    });

    it('keeps a non-default port', () => {
        expect(toCorsOrigin('http://localhost:3001/')).toBe(
            'http://localhost:3001',
        );
    });

    it.each([undefined, '', '   '])(
        'returns undefined when unset (%p)',
        (raw) => {
            expect(toCorsOrigin(raw)).toBeUndefined();
        },
    );

    it('throws on a value that is not a URL', () => {
        expect(() => toCorsOrigin('chore-app-delta.vercel.app')).toThrow(
            'FRONTEND_ORIGIN is not a valid URL',
        );
    });
});
