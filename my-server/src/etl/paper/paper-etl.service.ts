import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DataClient } from '../client/data-client';
import { PapersPageResponse, PaperDto } from '../dto/papers-page-response.dto';
import { Paper } from './paper.entity';
import { EtlUtil } from '../util/etl.util';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class PaperEtlService {
  private readonly logger = new Logger(PaperEtlService.name);
  private apiCallsCount = 0;

  constructor(
    private readonly dataClient: DataClient,
    @InjectRepository(Paper)
    private readonly repo: Repository<Paper>,
  ) {}

  async fetchAndSaveAllPapers(maxWindowSize: number): Promise<Paper[]> {
    this.apiCallsCount = 0;

    //=== API 메타데이터 확인용 1차 호출 (totalCount 확보) ===//
    const page = await this.dataClient.getPapers(0, 1);
    const totalCount = page.offsetInfo.totalCount;
    if (totalCount === 0) {
      this.logger.log('가져올 데이터가 없습니다.');
      return [];
    }

    //=== 데이터 전체 fetch ===//
    const start = 0;
    const end = Math.floor((totalCount - 1) / maxWindowSize) * maxWindowSize;
    const all = await this.fetchPapersByOffsets(start, end, maxWindowSize);

    // 날짜 정보 잘못된 인덱스들 필터링
    let invalidIndexes = this.getInvalidPaperIndexes(all);

    let fetchSize = totalCount;
    while (invalidIndexes.length > 0) {
      // 루프마다의 로그
      EtlUtil.logProgressStats(totalCount, fetchSize, invalidIndexes);

      // 인덱스들을 최소의 limit, 최소의 윈도우 그룹 수(=API 호출 수)가 나오게 묶음
      const windows = EtlUtil.groupOptimizedWindows(
        invalidIndexes,
        maxWindowSize,
      );
      fetchSize = windows.reduce((sum, window) => {
        const size = window[1];
        return sum + size;
      }, 0);

      // 재호출
      const refetch = await this.fetchPapersByWindows(windows);

      // 바꿔치기
      const invalidSet = new Set(invalidIndexes);
      const extracted = refetch.filter((paper) => invalidSet.has(paper.index));
      extracted.forEach((paper) => {
        all[paper.index] = paper;
      });

      // 다음 루프를 위한 업데이트
      invalidIndexes = this.getInvalidPaperIndexes(extracted);
    }

    this.logger.log(
      `완료: GET /papers API 총 호출 횟수 = ${this.apiCallsCount}`,
    );
    await this.savePapers(all);
    return all;
  }

  getInvalidPaperIndexes(papers: Paper[]): number[] {
    return papers
      .reduce<number[]>((acc, p) => {
        if (this.isDateInvalid(p) && p.index !== undefined) {
          acc.push(p.index);
        }
        return acc;
      }, [])
      .sort((a, b) => a - b);
  }

  private isDateInvalid(paper: Paper): boolean {
    return (
      paper.publishedAt == null ||
      paper.createdAt == null ||
      paper.updatedAt == null
    );
  }

  async fetchPapersByOffsets(
    start: number,
    end: number,
    window: number,
  ): Promise<Paper[]> {
    const papers: Paper[] = [];

    for (let offset = start; offset <= end; offset += window) {
      const { items } = await this.dataClient.getPapers(offset, window);
      this.apiCallsCount++;

      items.forEach((dto, i) => {
        papers.push(this.toPaper(dto, offset + i));
      });
    }

    return papers;
  }

  async fetchPapersByWindows(windows: number[][]): Promise<Paper[]> {
    const papers: Paper[] = [];

    for (const [offset, limit] of windows) {
      const response: PapersPageResponse = await this.dataClient.getPapers(
        offset,
        limit,
      );
      this.apiCallsCount += 1;

      const items = response.items;
      items.forEach((dto, i) => {
        papers.push(this.toPaper(dto, offset + i));
      });
    }

    return papers;
  }

  private toPaper(dto: PaperDto, index: number): Paper {
    const paper = new Paper();
    paper.id = dto.id;
    paper.researcherId = dto.researcherId;
    paper.title = dto.title;
    paper.abstract = dto.abstract;
    paper.keywords = dto.keywords;
    paper.publishedAt = EtlUtil.parseDate(dto.publishedAt);
    paper.createdAt = EtlUtil.parseDate(dto.createdAt);
    paper.updatedAt = EtlUtil.parseDate(dto.updatedAt);
    paper.index = index;

    return paper;
  }

  private async savePapers(papers: Paper[]): Promise<void> {
    try {
      // index 제거 + Date 검증
      const papersToSave = papers.map(({ index, ...rest }) => {
        return {
          ...rest,
          publishedAt: EtlUtil.normalizeDate(rest.publishedAt),
          createdAt: EtlUtil.normalizeDate(rest.createdAt),
          updatedAt: EtlUtil.normalizeDate(rest.updatedAt),
        };
      });

      const batchSize = 1000;
      let savedCount = 0;

      for (let i = 0; i < papersToSave.length; i += batchSize) {
        const batch = papersToSave.slice(i, i + batchSize);

        await this.repo
          .createQueryBuilder()
          .insert()
          .into(Paper)
          .values(batch)
          .orUpdate(
            [
              'title',
              'abstract',
              'keywords',
              'published_at',
              'created_at',
              'updated_at',
            ],
            ['id'],
          )
          .execute();

        savedCount += batch.length;
        this.logger.log(`Saved ${savedCount}/${papersToSave.length} papers`);
      }

      this.logger.log(`Completed saving ${papers.length} papers (bulk insert)`);
    } catch (error) {
      this.logger.error(
        'Failed to save papers (bulk insert)',
        error.stack ?? error,
      );
      throw error;
    }
  }
}
