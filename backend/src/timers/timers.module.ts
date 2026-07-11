import { Module } from '@nestjs/common';
import { TimersService } from './timers.service';

@Module({
  providers: [TimersService],
})
export class TimersModule {}
