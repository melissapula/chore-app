import { Module } from '@nestjs/common';
import { WeeklyGatesController } from './weekly-gates.controller';
import { WeeklyGatesService } from './weekly-gates.service';

@Module({
    controllers: [WeeklyGatesController],
    providers: [WeeklyGatesService],
})
export class WeeklyGatesModule {}
