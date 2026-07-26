import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { DbErrorFilter } from './common/db-error.filter';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const config = app.get(ConfigService);

    app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
    );
    // Sanitize leaked DB/RLS errors + remap their status codes (audit #2/#3).
    app.useGlobalFilters(new DbErrorFilter());
    app.enableCors({
        origin:
            config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3001',
        credentials: true,
    });

    const port = config.get<number>('PORT') ?? 3000;
    await app.listen(port);
}
void bootstrap();
