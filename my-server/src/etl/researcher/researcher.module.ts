import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../../config/config.module';
import { Researcher } from './researcher.entity';
import { ResearcherEtlService } from './researcher-etl.service';

@Module({
  imports: [TypeOrmModule.forFeature([Researcher]), ConfigModule],
  providers: [ResearcherEtlService],
  exports: [ResearcherEtlService],
})
export class ResearcherModule {}
