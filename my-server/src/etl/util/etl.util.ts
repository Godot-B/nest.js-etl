import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { Researcher } from '../researcher/researcher.entity';
import { Paper } from '../paper/paper.entity';
import { ResearcherPaperJoinDto } from '../dto/researcher-paper-join.dto';

export class EtlUtil {
  private static readonly logger = new Logger(EtlUtil.name);
  private static readonly DATA_DIR = 'data';
  private static readonly CSV_FILE_NAME = 'researcher_paper_joined';

  /**
   * 최소 개수, 최소 크기 윈도우의 (offset, limit) 묶음 만들기 유틸
   */
  static groupOptimizedWindows(
    idxList: number[],
    maxWindowSize: number,
  ): number[][] {
    const windows: number[][] = [];

    let offset = idxList[0];
    let before = offset;

    for (let i = 1; i < idxList.length; i++) {
      const current = idxList[i];

      // 현재 window 크기 계산
      const windowSize = current - offset + 1;

      if (windowSize > maxWindowSize) {
        const limit = before - offset + 1;
        windows.push([offset, limit]);

        offset = current;
      }

      before = current;
    }

    // 마지막 window
    const finalLimit = before - offset + 1;
    windows.push([offset, finalLimit]);

    return windows;
  }

  /**
   * 루프마다 로그 찍기 유틸
   */
  static logProgressStats(
    totalCount: number,
    fetchSize: number,
    invalidIndexes: number[],
  ): void {
    const ratio = (invalidIndexes.length * 100.0) / fetchSize;
    const ratioStr = `${ratio.toFixed(2)}%`;
    const remainRatio = (invalidIndexes.length * 100.0) / totalCount;
    const remainRatioStr = `${remainRatio.toFixed(2)}%`;
    this.logger.log(
      `가져온 총 개수: ${fetchSize}, 실패율: ${ratioStr}, 잔존 비율: ${remainRatioStr}\n`,
    );
  }

  /**
   * 안전한 날짜 파싱 유틸
   */
  static parseDate(value?: string | null): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  /**
   * 날짜 검사 유틸
   */
  static normalizeDate(value?: Date | null): Date | null {
    return value && !isNaN(value.getTime()) ? value : null;
  }

  /**
   * Researcher와 Paper를 JOIN하여 비정규화된 CSV 파일 저장 유틸
   */
  static async saveJoinedDataToCsv(
    researchers: Researcher[],
    papers: Paper[],
  ): Promise<void> {
    try {
      // 데이터 디렉토리 생성
      const dataDir = path.resolve(process.cwd(), this.DATA_DIR);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // 파일명 생성: 테스트 환경에서는 밀리초 타임스탬프 포함, 프로덕션에서는 날짜만
      const isTestEnv =
        process.env.NODE_ENV === 'test' ||
        process.env.JEST_WORKER_ID !== undefined;
      const timestamp = isTestEnv
        ? Date.now().toString() // 테스트 환경: 밀리초 타임스탬프
        : new Date().toISOString().split('T')[0]; // 프로덕션: YYYY-MM-DD
      const fileName = `${this.CSV_FILE_NAME}_${timestamp}.csv`;

      const csvPath = path.join(dataDir, fileName);

      // Researcher를 Map으로 변환 (id -> Researcher)
      const researcherMap = new Map<string, Researcher>();
      researchers.forEach((r) => {
        researcherMap.set(r.id, r);
      });

      // JOIN된 데이터 생성
      const joinedData: ResearcherPaperJoinDto[] = papers
        .map((paper) => {
          const researcher = researcherMap.get(paper.researcherId);
          if (!researcher) {
            this.logger.warn(
              `Researcher not found for paper: ${paper.id} with researcherId: ${paper.researcherId}`,
            );
            return null;
          }
          return this.createJoinDto(researcher, paper);
        })
        .filter((dto) => dto !== null) as ResearcherPaperJoinDto[];

      // CSV 파일로 저장
      await this.writeCsvFile(csvPath, joinedData);

      this.logger.log(
        `비정규화된 CSV 파일 저장 완료: ${csvPath} (총 ${joinedData.length}건)`,
      );
    } catch (error) {
      this.logger.error('CSV 파일 저장 중 오류 발생', error);
      throw new Error('CSV 파일 저장 실패');
    }
  }

  /**
   * Researcher와 Paper를 JOIN하여 DTO 생성
   */
  private static createJoinDto(
    {
      id,
      name,
      university,
      city,
      country,
      keywords,
      createdAt,
      updatedAt,
    }: Researcher,
    {
      id: paperId,
      title,
      abstract,
      keywords: paperKeywords,
      publishedAt,
      createdAt: paperCreatedAt,
      updatedAt: paperUpdatedAt,
    }: Paper,
  ): ResearcherPaperJoinDto {
    return {
      // Researcher 필드
      researcherId: id,
      researcherName: name,
      university,
      city,
      country,
      researcherKeywords: keywords,
      researcherCreatedAt: createdAt,
      researcherUpdatedAt: updatedAt,
      // Paper 필드
      paperId,
      title,
      abstractText: abstract,
      paperKeywords,
      publishedAt,
      paperCreatedAt,
      paperUpdatedAt,
    };
  }

  /**
   * CSV 파일 작성
   */
  private static async writeCsvFile(
    csvPath: string,
    joinedData: ResearcherPaperJoinDto[],
  ): Promise<void> {
    // CSV 헤더 정의
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'researcherId', title: 'researcher_id' },
        { id: 'researcherName', title: 'researcher_name' },
        { id: 'university', title: 'university' },
        { id: 'city', title: 'city' },
        { id: 'country', title: 'country' },
        { id: 'researcherKeywords', title: 'researcher_keywords' },
        { id: 'researcherCreatedAt', title: 'researcher_created_at' },
        { id: 'researcherUpdatedAt', title: 'researcher_updated_at' },
        { id: 'paperId', title: 'paper_id' },
        { id: 'title', title: 'title' },
        { id: 'abstractText', title: 'abstract' },
        { id: 'paperKeywords', title: 'paper_keywords' },
        { id: 'publishedAt', title: 'published_at' },
        { id: 'paperCreatedAt', title: 'paper_created_at' },
        { id: 'paperUpdatedAt', title: 'paper_updated_at' },
      ],
    });

    // 데이터 변환 (Date와 배열을 문자열로 변환)
    const csvData = joinedData.map((dto) => ({
      researcherId: dto.researcherId,
      researcherName: dto.researcherName,
      university: dto.university,
      city: dto.city,
      country: dto.country,
      researcherKeywords: this.formatList(dto.researcherKeywords),
      researcherCreatedAt: this.formatDateTime(dto.researcherCreatedAt),
      researcherUpdatedAt: this.formatDateTime(dto.researcherUpdatedAt),
      paperId: dto.paperId,
      title: dto.title,
      abstractText: dto.abstractText,
      paperKeywords: this.formatList(dto.paperKeywords),
      publishedAt: this.formatDateTime(dto.publishedAt),
      paperCreatedAt: this.formatDateTime(dto.paperCreatedAt),
      paperUpdatedAt: this.formatDateTime(dto.paperUpdatedAt),
    }));

    // CSV 파일 작성
    await csvWriter.writeRecords(csvData);
  }

  /**
   * List를 문자열로 변환
   */
  private static formatList(list: string[] | null | undefined): string {
    if (!list || list.length === 0) {
      return '';
    }
    return list.join(', ');
  }

  /**
   * Date를 문자열로 변환
   */
  private static formatDateTime(date: Date | null | undefined): string {
    if (!date) {
      return '';
    }
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}
