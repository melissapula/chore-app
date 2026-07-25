import { Module } from '@nestjs/common';
import { KidsController } from './kids.controller';
import { KidsService } from './kids.service';

@Module({
    controllers: [KidsController],
    providers: [KidsService],
})
export class KidsModule {}
