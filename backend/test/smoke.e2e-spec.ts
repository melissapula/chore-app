import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
    bootApp,
    cleanup,
    createParent,
    TestParent,
    uniqueTag,
} from './e2e-harness';

interface IdRow {
    id: string;
}

describe('backend smoke (e2e)', () => {
    let app: INestApplication<App> | undefined;
    let parent: TestParent | undefined;

    beforeAll(async () => {
        app = await bootApp();
        parent = await createParent(`smoke-${uniqueTag()}`);
    });

    afterAll(async () => {
        if (parent) await cleanup([parent.householdId], [parent.userId]);
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

    it('rejects a request with no bearer token', async () => {
        await http().get('/chore-instances').expect(401);
    });

    it('rejects an invalid token', async () => {
        await http()
            .get('/chore-instances')
            .set('Authorization', 'Bearer nope')
            .expect(401);
    });

    it('lets a parent create a paid chore, spawn it, and see it OPEN in the pool', async () => {
        const chore = await http()
            .post('/chores')
            .set('Authorization', asParent())
            .send({
                title: 'Feed the cat',
                chore_type: 'paid',
                value_cents: 150,
            })
            .expect(201);
        const spawned = await http()
            .post(`/chores/${(chore.body as IdRow).id}/instances`)
            .set('Authorization', asParent())
            .expect(201);
        const instanceId = (spawned.body as IdRow).id;

        const pool = await http()
            .get('/chore-instances')
            .set('Authorization', asParent())
            .expect(200);

        const listed = (pool.body as { id: string; state: string }[]).find(
            (row) => row.id === instanceId,
        );
        expect(listed?.state).toBe('OPEN');
    });

    it('strips unknown fields from a create payload', async () => {
        // Without the global ValidationPipe's whitelist, PostgREST would reject
        // the unknown column and this would be a 400.
        const res = await http()
            .post('/chores')
            .set('Authorization', asParent())
            .send({ title: 'Water plants', chore_type: 'paid', is_admin: true })
            .expect(201);

        expect(res.body).not.toHaveProperty('is_admin');
    });
});
