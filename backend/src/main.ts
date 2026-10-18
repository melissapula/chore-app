import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { toCorsOrigin } from './common/cors-origin';

async function bootstrap() {
    // Own the body parser so we can size it for avatar data-URL photos.
    const app = await NestFactory.create(AppModule, { bodyParser: false });
    const config = app.get(ConfigService);

    configureApp(app);

    // Fail fast if the allowed origin is unset in production (audit L2) rather
    // than silently falling back to localhost with credentials enabled.
    const origin = toCorsOrigin(config.get<string>('FRONTEND_ORIGIN'));
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
