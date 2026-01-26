import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ResearcherEtlService } from '../researcher/researcher-etl.service';
import { PaperEtlService } from '../paper/paper-etl.service';
import { Researcher } from '../researcher/researcher.entity';
import { Paper } from '../paper/paper.entity';
import { EtlUtil } from '../util/etl.util';

@Injectable()
export class EtlSchedulerService {
  private readonly logger = new Logger(EtlSchedulerService.name);

  private readonly MAX_WINDOW_SIZE = 100;

  constructor(
    private readonly researcherEtlService: ResearcherEtlService,
    private readonly paperEtlService: PaperEtlService,
  ) {}

  /**
   * 통합 ETL, 매월 1일 0시에 실행
   */
  @Cron('0 0 0 1 * *')
  async runEtl(): Promise<void> {
    this.logger.log('=== ETL 시작 ===');

    try {
      //=== 1. 연구자 데이터 수집, DB에 저장 ===//
      this.logger.log('1/3 연구자 ETL 시작');
      const researchers: Researcher[] =
        await this.researcherEtlService.fetchAndSaveAllResearchers(
          this.MAX_WINDOW_SIZE,
        );
      this.logger.log(`1/3 연구자 ETL 완료 — 총 ${researchers.length}건`);

      //=== 2. 논문 데이터 수집, DB에 저장 ===//
      this.logger.log('2/3 논문 ETL 시작');
      const papers: Paper[] = await this.paperEtlService.fetchAndSaveAllPapers(
        this.MAX_WINDOW_SIZE,
      );
      this.logger.log(`2/3 논문 ETL 완료 — 총 ${papers.length}건`);

      //=== 3. researcher와 paper를 조인하여 비정규화된 CSV 저장 ===//
      this.logger.log('3/3 CSV 생성 시작');
      await EtlUtil.saveJoinedDataToCsv(researchers, papers);
      this.logger.log(`3/3 CSV 생성 완료`);

      this.logger.log('=== ETL 완료 ===');
    } catch (error) {
      this.logger.error('ETL 실행 중 오류 발생', error.stack ?? error);
    }
  }
}
