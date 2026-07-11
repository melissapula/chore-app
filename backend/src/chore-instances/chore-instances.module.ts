import { Module } from '@nestjs/common';
import { ChoreInstancesController } from './chore-instances.controller';
import { ChoreInstancesService } from './chore-instances.service';

@Module({
  controllers: [ChoreInstancesController],
  providers: [ChoreInstancesService],
})
export class ChoreInstancesModule {}
