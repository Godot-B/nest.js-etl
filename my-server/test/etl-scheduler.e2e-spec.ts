import { Test, TestingModule } from '@nestjs/testing';
import {
  ConfigModule as NestConfigModule,
  ConfigService,
} from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { DataSource } from 'typeorm';
import AxiosMockAdapter from 'axios-mock-adapter';
import * as fs from 'fs';
import * as path from 'path';
import { EtlSchedulerService } from '../src/etl/scheduler/etl-scheduler.service';
import { ResearcherEtlService } from '../src/etl/researcher/researcher-etl.service';
import { PaperEtlService } from '../src/etl/paper/paper-etl.service';
import { DataClient } from '../src/etl/client/data-client';
import { Researcher } from '../src/etl/researcher/researcher.entity';
import { Paper } from '../src/etl/paper/paper.entity';
import { ResearchersPageResponse } from '../src/etl/dto/researchers-page-response.dto';
import { PapersPageResponse } from '../src/etl/dto/papers-page-response.dto';
import { HttpService } from '@nestjs/axios';

/**
 * EtlScheduler 통합 테스트
 * 테스트용 데이터베이스와 API 모킹을 사용하여 전체 ETL 프로세스를 검증합니다.
 */
describe('EtlScheduler 통합 테스트', () => {
  let app: TestingModule;
  let etlScheduler: EtlSchedulerService;
  let dataSource: DataSource;
  let httpService: HttpService;
  let mockAdapter: AxiosMockAdapter;
  let testSchema: string;

  const DATA_DIR = path.join(process.cwd(), 'data');

  beforeAll(async () => {
    // 테스트 전용 스키마 생성 (DataSource 생성 전에 스키마를 생성해야 함)
    const tempDataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_DATABASE || 'nestjs_test',
    });
    await tempDataSource.initialize();
    const randomValue =
      Date.now().toString(36) + Math.random().toString(36).substring(2);
    testSchema = `test_schema_${randomValue}`;
    await tempDataSource.query(`CREATE SCHEMA IF NOT EXISTS ${testSchema}`);

    // 테스트 스키마에 테이블 생성
    await tempDataSource.query(`
      CREATE TABLE IF NOT EXISTS ${testSchema}.researcher (
        id         VARCHAR(36) PRIMARY KEY,
        university VARCHAR(255),
        name       VARCHAR(255),
        city       VARCHAR(255),
        country    VARCHAR(255),
        keywords   JSONB,
        created_at TIMESTAMP WITHOUT TIME ZONE,
        updated_at TIMESTAMP WITHOUT TIME ZONE
      )
    `);

    await tempDataSource.query(`
      CREATE TABLE IF NOT EXISTS ${testSchema}.paper (
        id            VARCHAR(36) PRIMARY KEY,
        researcher_id VARCHAR(36),
        title         VARCHAR(255),
        abstract      TEXT,
        keywords      JSONB,
        published_at  TIMESTAMP WITHOUT TIME ZONE,
        created_at    TIMESTAMP WITHOUT TIME ZONE,
        updated_at    TIMESTAMP WITHOUT TIME ZONE,
        CONSTRAINT fk_paper_researcher
          FOREIGN KEY (researcher_id)
          REFERENCES ${testSchema}.researcher (id)
          ON UPDATE CASCADE
          ON DELETE SET NULL
      )
    `);

    await tempDataSource.destroy();

    // 테스트 환경 설정: TypeORM, HTTP 모듈, 환경 변수 설정
    app = await Test.createTestingModule({
      imports: [
        NestConfigModule.forRoot({
          envFilePath: '.env',
        }),
        TypeOrmModule.forRootAsync({
          imports: [NestConfigModule],
          useFactory: (configService: ConfigService) => ({
            type: 'postgres',
            host: configService.get<string>('DB_HOST', 'localhost'),
            port: configService.get<number>('DB_PORT', 5432),
            username: configService.get<string>('DB_USERNAME', 'root'),
            password: configService.get<string>('DB_PASSWORD', 'root'),
            database: configService.get<string>('DB_DATABASE', 'nestjs_test'),
            entities: [Researcher, Paper],
            synchronize: false,
            logging: configService.get<boolean>('DB_LOGGING', false),
            schema: testSchema,
          }),
          inject: [ConfigService],
        }),
        TypeOrmModule.forFeature([Researcher, Paper]),
        HttpModule.registerAsync({
          imports: [NestConfigModule],
          useFactory: (configService: ConfigService) => ({
            baseURL: configService.get<string>(
              'API_BASE_URL',
              'http://localhost:59625/labs',
            ),
            timeout: configService.get<number>('API_TIMEOUT', 5000),
          }),
          inject: [ConfigService],
        }),
      ],
      providers: [
        DataClient,
        ResearcherEtlService,
        PaperEtlService,
        EtlSchedulerService,
      ],
    }).compile();

    etlScheduler = app.get<EtlSchedulerService>(EtlSchedulerService);
    dataSource = app.get<DataSource>(DataSource);
    httpService = app.get<HttpService>(HttpService);

    mockAdapter = new AxiosMockAdapter(httpService.axiosRef);

    // DataSource에 스키마 설정
    dataSource.setOptions({ schema: testSchema });
  });

  beforeEach(async () => {
    // 각 테스트 전에 DB와 CSV 파일을 정리하여 독립적인 테스트 환경 보장
    await dataSource.query(`TRUNCATE TABLE ${testSchema}.paper CASCADE`);
    await dataSource.query(`TRUNCATE TABLE ${testSchema}.researcher CASCADE`);
    cleanupCsvFiles();
    mockAdapter.reset();
  });

  afterEach(() => {
    cleanupCsvFiles();
  });

  /**
   * 테스트에서 생성된 CSV 파일 정리
   */
  function cleanupCsvFiles() {
    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR);
      files.forEach((file) => {
        if (file.startsWith('researcher_paper_joined')) {
          try {
            fs.unlinkSync(path.join(DATA_DIR, file));
          } catch (error) {
            // 파일이 이미 삭제되었거나 접근할 수 없는 경우 무시
          }
        }
      });
    }
  }

  /**
   * 생성된 CSV 파일 찾기 (타임스탬프가 포함된 파일명 처리)
   */
  function findCsvFile(): string | null {
    if (!fs.existsSync(DATA_DIR)) {
      return null;
    }
    const files = fs.readdirSync(DATA_DIR);
    const csvFile = files.find((file) =>
      file.startsWith('researcher_paper_joined'),
    );
    return csvFile ? path.join(DATA_DIR, csvFile) : null;
  }

  afterAll(async () => {
    mockAdapter.restore();

    // 테스트 스키마 삭제
    if (testSchema) {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
    }

    await app.close();
  });

  it('통합_테스트', async () => {
    // given: 테스트 데이터 설정
    const maxWindowSize = 100;
    const totalResearcherCount = 200;
    const totalPaperCount = 150;

    // API mock 설정: researcher와 paper 데이터를 반환하도록 설정
    setupResearcherMocks(maxWindowSize, totalResearcherCount);
    setupPaperMocks(maxWindowSize, totalPaperCount);

    // when: ETL 프로세스 실행 (researcher 조회 -> paper 조회 -> CSV 생성)
    await etlScheduler.runEtl();

    // then: DB에 데이터가 정상적으로 저장되었는지 검증
    const researcherCountResult = await dataSource.query(
      `SELECT COUNT(*) as count FROM ${testSchema}.researcher`,
    );
    const paperCountResult = await dataSource.query(
      `SELECT COUNT(*) as count FROM ${testSchema}.paper`,
    );

    const researcherCount = parseInt(researcherCountResult[0].count);
    const paperCount = parseInt(paperCountResult[0].count);

    expect(researcherCount).toBe(totalResearcherCount);
    expect(paperCount).toBe(totalPaperCount);

    // CSV 파일이 생성되었는지 검증
    const csvFilePath = findCsvFile();
    expect(csvFilePath).not.toBeNull();
    expect(fs.existsSync(csvFilePath!)).toBe(true);

    // CSV 파일 내용 검증
    const lines = fs.readFileSync(csvFilePath!, 'utf-8').split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toContain('researcher_id');
    expect(lines[0]).toContain('paper_id');
  });

  /**
   * Researcher API mock 설정
   * totalCount 확인용 meta 호출과 실제 데이터 조회 호출을 모두 mock합니다.
   */
  function setupResearcherMocks(maxWindowSize: number, totalCount: number) {
    const validDate = new Date().toISOString();

    // 첫 번째 호출: totalCount 확인을 위한 meta 페이지 (limit=1)
    const metaPage: ResearchersPageResponse = {
      items: [
        createResearcherDto('researcher-0', 'Name 0', validDate, validDate),
      ],
      offsetInfo: { limit: 1, offset: 0, totalCount },
    };
    mockAdapter.onGet('/researchers').replyOnce(200, metaPage);

    // 실제 데이터 조회를 위한 mock 설정
    const start = 0;
    const end = Math.floor((totalCount - 1) / maxWindowSize) * maxWindowSize;

    for (let offset = start; offset <= end; offset += maxWindowSize) {
      const actualLimit = Math.min(maxWindowSize, totalCount - offset);

      const pageResponse: ResearchersPageResponse = {
        items: [],
        offsetInfo: { limit: maxWindowSize, offset, totalCount },
      };

      for (let i = 0; i < actualLimit; i++) {
        const index = offset + i;
        pageResponse.items.push(
          createResearcherDto(
            `researcher-${index}`,
            `Name ${index}`,
            validDate,
            validDate,
          ),
        );
      }

      mockAdapter.onGet('/researchers').replyOnce(200, pageResponse);
    }
  }

  /**
   * Paper API mock 설정
   * totalCount 확인용 meta 호출과 실제 데이터 조회 호출을 모두 mock합니다.
   */
  function setupPaperMocks(maxWindowSize: number, totalCount: number) {
    const validDate = new Date().toISOString();

    // 첫 번째 호출: totalCount 확인을 위한 meta 페이지 (limit=1)
    const metaPage: PapersPageResponse = {
      items: [
        createPaperDto(
          'paper-0',
          'researcher-0',
          validDate,
          validDate,
          validDate,
        ),
      ],
      offsetInfo: { limit: 1, offset: 0, totalCount },
    };
    mockAdapter.onGet('/papers').replyOnce(200, metaPage);

    // 실제 데이터 조회를 위한 mock 설정
    const start = 0;
    const end = Math.floor((totalCount - 1) / maxWindowSize) * maxWindowSize;

    for (let offset = start; offset <= end; offset += maxWindowSize) {
      const actualLimit = Math.min(maxWindowSize, totalCount - offset);

      const pageResponse: PapersPageResponse = {
        items: [],
        offsetInfo: { limit: maxWindowSize, offset, totalCount },
      };

      for (let i = 0; i < actualLimit; i++) {
        const index = offset + i;
        pageResponse.items.push(
          createPaperDto(
            `paper-${index}`,
            `researcher-${index % 200}`, // researcher와의 관계 설정
            validDate,
            validDate,
            validDate,
          ),
        );
      }

      mockAdapter.onGet('/papers').replyOnce(200, pageResponse);
    }
  }

  /**
   * 테스트용 ResearcherDto 생성
   */
  function createResearcherDto(
    id: string,
    name: string,
    createdAt: string,
    updatedAt: string,
  ) {
    return {
      id,
      university: `University ${id}`,
      name,
      city: `City ${id}`,
      country: `Country ${id}`,
      keywords: ['keyword1', 'keyword2'],
      createdAt,
      updatedAt,
    };
  }

  /**
   * 테스트용 PaperDto 생성
   */
  function createPaperDto(
    id: string,
    researcherId: string,
    publishedAt: string,
    createdAt: string,
    updatedAt: string,
  ) {
    return {
      id,
      researcherId,
      title: `Title ${id}`,
      abstract: `Abstract ${id}`,
      keywords: ['keyword1', 'keyword2'],
      publishedAt,
      createdAt,
      updatedAt,
    };
  }
});
