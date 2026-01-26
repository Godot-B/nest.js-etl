import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { ResearcherModule } from './researcher/researcher.module';
import { PaperModule } from './paper/paper.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [ConfigModule, ResearcherModule, PaperModule, SchedulerModule],
  exports: [ResearcherModule, PaperModule, SchedulerModule],
})
export class EtlModule {}
