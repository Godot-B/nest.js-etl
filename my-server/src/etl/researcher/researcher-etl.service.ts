import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DataClient } from '../client/data-client';
import {
  ResearchersPageResponse,
  ResearcherDto,
} from '../dto/researchers-page-response.dto';
import { Researcher } from './researcher.entity';
import { EtlUtil } from '../util/etl.util';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class ResearcherEtlService {
  private readonly logger = new Logger(ResearcherEtlService.name);
  private apiCallsCount = 0;

  constructor(
    private readonly dataClient: DataClient,
    @InjectRepository(Researcher)
    private readonly repo: Repository<Researcher>,
  ) {}

  async fetchAndSaveAllResearchers(
    maxWindowSize: number,
  ): Promise<Researcher[]> {
    this.apiCallsCount = 0;

    //=== API 메타데이터 확인용 1차 호출 (totalCount 확보) ===//
    const page = await this.dataClient.getResearchers(0, 1);
    const totalCount = page.offsetInfo.totalCount;
    if (totalCount <= 0) {
      this.logger.log('가져올 데이터가 없습니다.');
      return [];
    }

    //=== 데이터 전체 fetch ===//
    const start = 0;
    const end = Math.floor((totalCount - 1) / maxWindowSize) * maxWindowSize;
    const all = await this.fetchResearchersByOffsets(start, end, maxWindowSize);

    // 날짜 정보 잘못된 인덱스들 필터링
    let invalidIndexes = this.getInvalidResearcherIndexes(all);

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
      const refetch = await this.fetchResearchersByWindows(windows);

      // 바꿔치기
      const invalidSet = new Set(invalidIndexes);
      const extracted = refetch.filter((researcher) =>
        invalidSet.has(researcher.index),
      );
      extracted.forEach((researcher) => {
        all[researcher.index] = researcher;
      });

      // 다음 루프를 위한 업데이트
      invalidIndexes = this.getInvalidResearcherIndexes(extracted);
    }

    this.logger.log(
      `완료: GET /researchers API 총 호출 횟수 = ${this.apiCallsCount}`,
    );
    await this.saveResearchers(all);
    return all;
  }

  getInvalidResearcherIndexes(researchers: Researcher[]): number[] {
    return researchers
      .reduce<number[]>((acc, r) => {
        if (this.isDateInvalid(r) && r.index !== undefined) {
          acc.push(r.index);
        }
        return acc;
      }, [])
      .sort((a, b) => a - b);
  }

  private isDateInvalid(researcher: Researcher): boolean {
    return researcher.createdAt == null || researcher.updatedAt == null;
  }

  async fetchResearchersByOffsets(
    start: number,
    end: number,
    window: number,
  ): Promise<Researcher[]> {
    const researchers: Researcher[] = [];

    for (let offset = start; offset <= end; offset += window) {
      const { items } = await this.dataClient.getResearchers(offset, window);
      this.apiCallsCount++;

      items.forEach((dto, i) => {
        researchers.push(this.toResearcher(dto, offset + i));
      });
    }

    return researchers;
  }

  async fetchResearchersByWindows(windows: number[][]): Promise<Researcher[]> {
    const researchers: Researcher[] = [];

    for (const [offset, limit] of windows) {
      const response: ResearchersPageResponse =
        await this.dataClient.getResearchers(offset, limit);
      this.apiCallsCount += 1;

      const items = response.items;
      items.forEach((dto, i) => {
        researchers.push(this.toResearcher(dto, offset + i));
      });
    }

    return researchers;
  }

  private toResearcher(dto: ResearcherDto, index: number): Researcher {
    const researcher = new Researcher();
    researcher.id = dto.id;
    researcher.name = dto.name;
    researcher.university = dto.university;
    researcher.city = dto.city;
    researcher.country = dto.country;
    researcher.keywords = dto.keywords;
    researcher.createdAt = EtlUtil.parseDate(dto.createdAt);
    researcher.updatedAt = EtlUtil.parseDate(dto.updatedAt);
    researcher.index = index;

    return researcher;
  }

  private async saveResearchers(researchers: Researcher[]): Promise<void> {
    try {
      // index 제거 + Date 검증
      const researchersToSave = researchers.map(({ index, ...rest }) => {
        return {
          ...rest,
          createdAt: EtlUtil.normalizeDate(rest.createdAt),
          updatedAt: EtlUtil.normalizeDate(rest.updatedAt),
        };
      });

      const batchSize = 1000;
      let savedCount = 0;

      for (let i = 0; i < researchersToSave.length; i += batchSize) {
        const batch = researchersToSave.slice(i, i + batchSize);

        await this.repo
          .createQueryBuilder()
          .insert()
          .into(Researcher)
          .values(batch)
          .orUpdate(
            [
              'university',
              'name',
              'city',
              'country',
              'keywords',
              'created_at',
              'updated_at',
            ],
            ['id'],
          )
          .execute();

        savedCount += batch.length;
        this.logger.log(
          `Saved ${savedCount}/${researchersToSave.length} researchers`,
        );
      }

      this.logger.log(
        `Completed saving ${researchers.length} researchers (bulk insert)`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to save researchers (bulk insert)',
        error.stack ?? error,
      );
      throw error;
    }
  }
}
