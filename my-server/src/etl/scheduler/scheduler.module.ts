import { Module } from '@nestjs/common';
import { ResearcherModule } from '../researcher/researcher.module';
import { PaperModule } from '../paper/paper.module';
import { EtlSchedulerService } from './etl-scheduler.service';

@Module({
  imports: [ResearcherModule, PaperModule],
  providers: [EtlSchedulerService],
  exports: [EtlSchedulerService],
})
export class SchedulerModule {}
