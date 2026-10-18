import { ForbiddenException, HttpException } from '@nestjs/common';
import { KidsService } from './kids.service';
import { AuthUser } from '../auth/auth-user.interface';
import { fakeSupabase } from '../testing/fake-supabase';

const parent: AuthUser = {
    id: 'parent-1',
    householdId: 'house-1',
    role: 'parent',
    accessToken: 'jwt',
};
const dbDown = { error: { message: 'connection terminated' } };

/** A failed lookup is a server fault (logged 500), not "not your kid" (403). */
async function expectServerFault(promise: Promise<unknown>) {
    const err: unknown = await promise.then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(HttpException);
}

describe('KidsService target-kid lookup', () => {
    it('update rejects instead of reporting forbidden when the kid lookup fails', async () => {
        const fake = fakeSupabase({ users: [dbDown] });
        const kidsSvc = new KidsService(fake.service);

        await expectServerFault(
            kidsSvc.update(parent, 'kid-a', { display_name: 'Ava' }),
        );
        expect(fake.writes).toEqual([]);
    });

    it('remove rejects instead of reporting forbidden when the kid lookup fails', async () => {
        const fake = fakeSupabase({ users: [dbDown] });
        const kidsSvc = new KidsService(fake.service);

        await expectServerFault(kidsSvc.remove(parent, 'kid-a'));
        expect(fake.client.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    it('remove still reports forbidden for a kid in another household', async () => {
        const fake = fakeSupabase({
            users: [
                {
                    data: {
                        id: 'kid-x',
                        household_id: 'house-2',
                        role: 'kid',
                    },
                },
            ],
        });
        const kidsSvc = new KidsService(fake.service);

        await expect(kidsSvc.remove(parent, 'kid-x')).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(fake.client.auth.admin.deleteUser).not.toHaveBeenCalled();
    });
});
