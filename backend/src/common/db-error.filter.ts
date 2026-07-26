import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Global exception filter (audit #2/#3).
 *
 * Services wrap Supabase/PostgREST failures in `BadRequestException(error.message)`,
 * which forwards raw Postgres/RLS text (constraint names, columns, policy names)
 * to the client and reports the wrong status (everything as 400/409). This filter
 * catches those, logs the real message server-side, and returns a generic message
 * with a sensible status — while passing our own hand-written messages through
 * untouched (they never contain these DB keywords).
 */
const DB_LEAK =
    /violates|constraint|row-level security|duplicate key|invalid input syntax|does not exist|permission denied|null value in column|foreign key|violates not-null/i;

@Catch()
export class DbErrorFilter implements ExceptionFilter {
    private readonly logger = new Logger('DbErrorFilter');

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();
        const req = ctx.getRequest<Request>();

        let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
        let message: string | string[] = 'Something went wrong';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const body = exception.getResponse();
            const raw =
                typeof body === 'string'
                    ? body
                    : ((body as { message?: string | string[] }).message ??
                      exception.message);
            const rawStr = Array.isArray(raw) ? raw.join('; ') : String(raw);

            if (DB_LEAK.test(rawStr)) {
                this.logger.warn(
                    `${req.method} ${req.url} — leaked DB error suppressed: ${rawStr}`,
                );
                if (/row-level security|permission denied/i.test(rawStr)) {
                    status = HttpStatus.FORBIDDEN;
                    message = "You don't have access to do that";
                } else if (/duplicate key|unique/i.test(rawStr)) {
                    status = HttpStatus.CONFLICT;
                    message = 'That already exists';
                } else {
                    status = HttpStatus.BAD_REQUEST;
                    message = "That didn't work — please check your input";
                }
            } else {
                // Our own message (validation, state checks, auth) — safe.
                message = raw;
            }
        } else {
            // Unexpected — log everything, tell the client nothing specific.
            this.logger.error(
                `${req.method} ${req.url} — unhandled exception`,
                exception instanceof Error
                    ? exception.stack
                    : String(exception),
            );
        }

        res.status(status).json({ statusCode: status, message });
    }
}
