import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { TimersModule } from './timers/timers.module';
import { ChoresModule } from './chores/chores.module';
import { ChoreInstancesModule } from './chore-instances/chore-instances.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // drives the server-authoritative timer sweep
    SupabaseModule,
    TimersModule,
    ChoresModule,
    ChoreInstancesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
