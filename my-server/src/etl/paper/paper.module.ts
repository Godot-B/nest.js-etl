import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../../config/config.module';
import { Paper } from './paper.entity';
import { PaperEtlService } from './paper-etl.service';

@Module({
  imports: [TypeOrmModule.forFeature([Paper]), ConfigModule],
  providers: [PaperEtlService],
  exports: [PaperEtlService],
})
export class PaperModule {}
