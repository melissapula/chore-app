import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { DbErrorFilter } from './common/db-error.filter';

async function bootstrap() {
    // Own the body parser so we can size it for avatar data-URL photos.
    const app = await NestFactory.create(AppModule, { bodyParser: false });
    const config = app.get(ConfigService);

    app.use(helmet());
    app.use(json({ limit: '2mb' }));

    // whitelist strips unknown fields (blocks mass-assignment); transform coerces types.
    app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
    );
    // Sanitize leaked DB/RLS errors + remap their status codes (audit #2/#3).
    app.useGlobalFilters(new DbErrorFilter());

    // Fail fast if the allowed origin is unset in production (audit L2) rather
    // than silently falling back to localhost with credentials enabled.
    const origin = config.get<string>('FRONTEND_ORIGIN');
    if (process.env.NODE_ENV === 'production' && !origin) {
        throw new Error('FRONTEND_ORIGIN must be set in production');
    }
    app.enableCors({
        origin: origin ?? 'http://localhost:3001',
        credentials: true,
    });

    const port = config.get<number>('PORT') ?? 3000;
    await app.listen(port);
}
void bootstrap();
