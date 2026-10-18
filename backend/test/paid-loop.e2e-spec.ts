import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
    adminClient,
    bootApp,
    cleanup,
    createParent,
    signInKid,
    TestParent,
    uniqueTag,
} from './e2e-harness';

const KID_PIN = '123456';
const CHORE_VALUE_CENTS = 150;

interface IdRow {
    id: string;
}

interface InstanceRow {
    id: string;
    state: string;
}

describe('paid chore loop (e2e)', () => {
    let app: INestApplication<App> | undefined;
    let parent: TestParent | undefined;
    let kidId: string | undefined;
    let kidToken: string | undefined;

    beforeAll(async () => {
        app = await bootApp();
        const tag = uniqueTag();
        parent = await createParent(`paid-${tag}`);

        const username = `kid_${tag}`;
        const kid = await http()
            .post('/kids')
            .set('Authorization', asParent())
            .send({ display_name: 'E2E Kid', username, pin: KID_PIN })
            .expect(201);
        kidId = (kid.body as IdRow).id;
        kidToken = await signInKid(username, KID_PIN);
    });

    afterAll(async () => {
        if (parent) {
            const users = kidId ? [parent.userId, kidId] : [parent.userId];
            await cleanup([parent.householdId], users);
        }
        await app?.close();
    });

    function http() {
        if (!app) throw new Error('app did not boot');
        return request(app.getHttpServer());
    }

    function asParent() {
        if (!parent) throw new Error('parent was not created');
        return `Bearer ${parent.token}`;
    }

    function asKid() {
        if (!kidToken) throw new Error('kid was not signed in');
        return `Bearer ${kidToken}`;
    }

    /** Parent creates + spawns a paid chore; returns the OPEN instance id. */
    async function spawnPaidChore(title: string): Promise<string> {
        const chore = await http()
            .post('/chores')
            .set('Authorization', asParent())
            .send({
                title,
                chore_type: 'paid',
                value_cents: CHORE_VALUE_CENTS,
            })
            .expect(201);
        const spawned = await http()
            .post(`/chores/${(chore.body as IdRow).id}/instances`)
            .set('Authorization', asParent())
            .expect(201);
        return (spawned.body as IdRow).id;
    }

    /** Kid runs claim → start → submit, asserting each resulting state. */
    async function kidSubmits(instanceId: string): Promise<void> {
        const steps: [string, string][] = [
            ['claim', 'CLAIMED'],
            ['start', 'IN_PROGRESS'],
            ['submit', 'SUBMITTED'],
        ];
        for (const [action, expected] of steps) {
            const res = await http()
                .post(`/chore-instances/${instanceId}/${action}`)
                .set('Authorization', asKid())
                .expect(201);
            expect((res.body as InstanceRow).state).toBe(expected);
        }
    }

    async function ledgerFor(instanceId: string) {
        const { data, error } = await adminClient()
            .from('ledger_entries')
            .select('kid_id, delta_cents, reason')
            .eq('chore_instance_id', instanceId);
        if (error) throw new Error(`ledger read failed: ${error.message}`);
        return data;
    }

    it("credits the kid's ledger when a parent approves a submitted paid chore", async () => {
        const instanceId = await spawnPaidChore('Take out the trash');
        await kidSubmits(instanceId);

        const approved = await http()
            .post(`/chore-instances/${instanceId}/approve`)
            .set('Authorization', asParent())
            .expect(201);
        expect((approved.body as InstanceRow).state).toBe('APPROVED');

        expect(await ledgerFor(instanceId)).toEqual([
            {
                kid_id: kidId,
                delta_cents: CHORE_VALUE_CENTS,
                reason: 'chore_approved',
            },
        ]);
    });

    it('does not let a kid approve their own chore', async () => {
        const instanceId = await spawnPaidChore('Sweep the porch');
        await kidSubmits(instanceId);

        // 403 from ChoreInstancesService.approve()'s parent check, before the
        // approve RPC (which would also refuse) is ever called.
        await http()
            .post(`/chore-instances/${instanceId}/approve`)
            .set('Authorization', asKid())
            .expect(403);

        expect(await ledgerFor(instanceId)).toEqual([]);
    });
});
