import { Global, Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/** Global so the state machine + cron sweep can inject PushService to notify. */
@Global()
@Module({
    controllers: [PushController],
    providers: [PushService],
    exports: [PushService],
})
export class PushModule {}
