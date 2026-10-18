import { INestApplication, ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import helmet from 'helmet';
import { DbErrorFilter } from './common/db-error.filter';

/**
 * The request pipeline shared by main.ts and the e2e specs. The app must be
 * created with `{ bodyParser: false }` so the json limit below applies.
 */
export function configureApp(app: INestApplication): void {
    app.use(helmet());
    app.use(json({ limit: '2mb' }));

    // whitelist strips unknown fields (blocks mass-assignment); transform coerces types.
    app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
    );
    // Sanitize leaked DB/RLS errors + remap their status codes (audit #2/#3).
    app.useGlobalFilters(new DbErrorFilter());
}
