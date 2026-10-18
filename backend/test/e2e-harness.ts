import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { DbResult } from '../src/db-types';
import { kidEmail, kidPassword } from '../src/kids/kid-auth';

/**
 * Helpers for the backend e2e specs. They run against a throwaway LOCAL
 * Supabase stack (`npx supabase@2 start` from the repo root), never the live
 * project.
 */

const CHORE_SCHEMA = 'chore';
const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];
const PARENT_PASSWORD = 'e2e-parent-password';

interface E2eEnv {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
}

export interface TestParent {
    token: string;
    userId: string;
    householdId: string;
}

/**
 * Reads the stack's keys from the environment. ConfigModule copies any key
 * missing from process.env out of backend/.env when AppModule is imported, so
 * a local run can see the LIVE project's values here — hence the host check.
 */
function e2eEnv(): E2eEnv {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceRoleKey) {
        throw new Error(
            'e2e needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY: run `npx supabase@2 start` from the repo root and export its keys',
        );
    }
    const host = new URL(url).hostname;
    if (!LOCAL_HOSTS.includes(host)) {
        throw new Error(
            `e2e only runs against a local Supabase stack, not ${host}: run \`npx supabase@2 start\` and export its keys`,
        );
    }
    return { url, anonKey, serviceRoleKey };
}

/** A unique, username-safe suffix so reruns and parallel files don't collide. */
export function uniqueTag(): string {
    return randomUUID().replace(/-/g, '').slice(0, 10);
}

/** Boots the real AppModule with the same request pipeline as main.ts. */
export async function bootApp(): Promise<INestApplication<App>> {
    e2eEnv();
    const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication<INestApplication<App>>({
        bodyParser: false,
    });
    configureApp(app);
    await app.init();

    // The per-minute timer sweep registers its cron job during init(); stop it
    // so it can't race the specs.
    const scheduler = app.get(SchedulerRegistry);
    for (const name of [...scheduler.getCronJobs().keys()]) {
        scheduler.deleteCronJob(name);
    }
    return app;
}

/** RLS-bypassing client, same options as SupabaseService.serviceClient(). */
export function adminClient(): SupabaseClient<any, any, any> {
    const { url, serviceRoleKey } = e2eEnv();
    return createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: CHORE_SCHEMA },
    });
}

function anonClient(accessToken?: string): SupabaseClient<any, any, any> {
    const { url, anonKey } = e2eEnv();
    return createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: CHORE_SCHEMA },
        global: accessToken
            ? { headers: { Authorization: `Bearer ${accessToken}` } }
            : undefined,
    });
}

async function signIn(email: string, password: string): Promise<string> {
    const { data, error } = await anonClient().auth.signInWithPassword({
        email,
        password,
    });
    if (error || !data.session) {
        throw new Error(`sign-in failed for ${email}: ${error?.message}`);
    }
    return data.session.access_token;
}

/** A confirmed parent with their own household (via bootstrap_household). */
export async function createParent(tag: string): Promise<TestParent> {
    const email = `parent-${tag}@e2e.choreq.local`;
    const { data, error } = await adminClient().auth.admin.createUser({
        email,
        password: PARENT_PASSWORD,
        email_confirm: true,
    });
    if (error || !data.user) {
        throw new Error(`createUser failed for ${email}: ${error?.message}`);
    }

    const token = await signIn(email, PARENT_PASSWORD);
    const { data: householdId, error: rpcErr } = (await anonClient(token).rpc(
        'bootstrap_household',
        {
            household_name: `E2E household ${tag}`,
            display_name: `E2E parent ${tag}`,
        },
    )) as DbResult<string>;
    if (rpcErr || !householdId) {
        throw new Error(`bootstrap_household failed: ${rpcErr?.message}`);
    }
    return { token, userId: data.user.id, householdId };
}

/** Signs a kid in the way the login page does: username + PIN. */
export function signInKid(username: string, pin: string): Promise<string> {
    return signIn(kidEmail(username), kidPassword(pin));
}

/** Deletes the households (their rows cascade), then the auth users. */
export async function cleanup(
    householdIds: string[],
    authUserIds: string[],
): Promise<void> {
    const admin = adminClient();
    const { error } = await admin
        .from('households')
        .delete()
        .in('id', householdIds);
    if (error) throw new Error(`household cleanup failed: ${error.message}`);
    for (const id of authUserIds) {
        const { error: userErr } = await admin.auth.admin.deleteUser(id);
        if (userErr) {
            throw new Error(`user cleanup failed: ${userErr.message}`);
        }
    }
}
