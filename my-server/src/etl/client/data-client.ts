import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { PapersPageResponse } from '../dto/papers-page-response.dto';
import { ResearchersPageResponse } from '../dto/researchers-page-response.dto';

@Injectable()
export class DataClient {
  private readonly logger = new Logger(DataClient.name);

  constructor(private readonly httpService: HttpService) {}

  async getResearchers(
    offset: number,
    limit: number,
  ): Promise<ResearchersPageResponse> {
    return this.fetchPage<ResearchersPageResponse>(
      '/researchers',
      offset,
      limit,
    );
  }

  async getPapers(offset: number, limit: number): Promise<PapersPageResponse> {
    return this.fetchPage<PapersPageResponse>('/papers', offset, limit);
  }

  private async fetchPage<T>(
    path: string,
    offset: number,
    limit: number,
  ): Promise<T> {
    this.logger.log(`GET ${path}`, { offset, limit });

    const maxTry = 6;

    // 최대 5번 실패까지 목격하였으므로 6번 시도
    for (let attempt = 1; attempt <= maxTry; attempt++) {
      try {
        const { data } = await this.httpService.axiosRef.get<T>(path, {
          params: { offset, limit },
        });

        return data;
      } catch (e: any) {
        const err = e as AxiosError;
        const status = err.response?.status;

        // 재시도 가능 오류
        if (status === 503 || status === 429) {
          this.logger.warn(
            `Retryable error on ${path} (status=${status}, attempt=${attempt}/${maxTry})`,
          );

          if (attempt === maxTry) {
            this.logger.error(`Max retry exceeded for ${path}`);
            throw err;
          }

          await this.sleep(1000);
        } else {
          // 재시도 불가
          this.logger.error(`Non-retryable error on ${path}`, err);
          throw err;
        }
      }
    }

    throw new Error('Unexpected fall-through');
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
