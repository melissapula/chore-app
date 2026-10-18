import { SupabaseService } from '../supabase/supabase.service';

/** One scripted `{ data, error }` reply, as a PostgREST call would resolve. */
export interface FakeReply {
    data?: unknown;
    error?: { message: string; code?: string } | null;
}

/** A write the service attempted, in order — so specs can assert "never inserted". */
export interface FakeWrite {
    table: string;
    op: 'insert' | 'update' | 'delete';
}

/**
 * A stand-in for SupabaseService at the database boundary (specs only).
 *
 * Each `from(table)` call takes the next scripted reply queued for that table,
 * and each `rpc(fn)` call the next one queued under the function's name;
 * every chained builder method (`select`, `eq`, `maybeSingle`, …) returns the
 * builder, and awaiting it resolves the reply. Both `serviceClient()` and
 * `userClient()` hand back the same fake, since specs care about what the
 * service does with the replies, not which key it used.
 */
export function fakeSupabase(replies: Record<string, FakeReply[]>) {
    const queues: Record<string, FakeReply[]> = Object.fromEntries(
        Object.entries(replies).map(([t, r]) => [t, [...r]]),
    );
    const writes: FakeWrite[] = [];

    const builder = (table: string) => {
        const reply = queues[table]?.shift();
        if (!reply)
            throw new Error(`fakeSupabase: no reply queued for ${table}`);
        const resolved = {
            data: reply.data ?? null,
            error: reply.error ?? null,
        };
        const b: Record<string, unknown> = {
            then: (
                onOk: (v: typeof resolved) => unknown,
                onErr?: (e: unknown) => unknown,
            ) => Promise.resolve(resolved).then(onOk, onErr),
        };
        for (const m of [
            'select',
            'eq',
            'gt',
            'gte',
            'order',
            'maybeSingle',
            'single',
        ]) {
            b[m] = () => b;
        }
        for (const op of ['insert', 'update', 'delete'] as const) {
            b[op] = () => {
                writes.push({ table, op });
                return b;
            };
        }
        return b;
    };

    const client = {
        from: (table: string) => builder(table),
        rpc: (fn: string) => builder(fn),
        auth: {
            admin: {
                updateUserById: jest.fn().mockResolvedValue({ error: null }),
                deleteUser: jest.fn().mockResolvedValue({ error: null }),
            },
        },
    };

    const service = {
        serviceClient: () => client,
        userClient: () => client,
    } as unknown as SupabaseService;

    return { service, client, writes };
}
