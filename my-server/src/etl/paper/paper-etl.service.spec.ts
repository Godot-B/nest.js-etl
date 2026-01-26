import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaperEtlService } from './paper-etl.service';
import { DataClient } from '../client/data-client';
import { PapersPageResponse, PaperDto } from '../dto/papers-page-response.dto';
import { OffsetInfo } from '../dto/offset-info.dto';
import { Paper } from './paper.entity';
import { EtlUtil } from '../util/etl.util';

/**
 * PaperEtlService 테스트
 * Paper ETL 서비스의 데이터 조회 및 검증 로직을 검증합니다.
 */
describe('PaperEtlService', () => {
  let service: PaperEtlService;
  let dataClient: jest.Mocked<DataClient>;

  beforeEach(async () => {
    // DataClient와 Repository를 mock으로 주입
    const mockDataClient = {
      getPapers: jest.fn(),
    };

    const mockRepository = {
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaperEtlService,
        {
          provide: DataClient,
          useValue: mockDataClient,
        },
        {
          provide: getRepositoryToken(Paper),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<PaperEtlService>(PaperEtlService);
    dataClient = module.get(DataClient);
  });

  describe('오프셋조회', () => {
    it('오프셋리밋은_정확하게전달되어야한다', async () => {
      // given: 여러 페이지에 걸친 데이터 조회 시나리오
      const firstOffset = 0;
      const lastOffset = 20;
      const maxWindowSize = 10;

      const page1 = createMockPageResponse(0, 10, 10);
      const page2 = createMockPageResponse(10, 10, 10);
      const page3 = createMockPageResponse(20, 10, 1);

      dataClient.getPapers.mockResolvedValueOnce(page1);
      dataClient.getPapers.mockResolvedValueOnce(page2);
      dataClient.getPapers.mockResolvedValueOnce(page3);

      // when: offset 범위로 데이터 조회
      const papers = await service.fetchPapersByOffsets(
        firstOffset,
        lastOffset,
        maxWindowSize,
      );

      // then: 올바른 offset과 limit으로 API가 호출되었는지 검증
      expect(dataClient.getPapers).toHaveBeenCalledTimes(3);
      expect(dataClient.getPapers).toHaveBeenNthCalledWith(1, 0, maxWindowSize);
      expect(dataClient.getPapers).toHaveBeenNthCalledWith(
        2,
        10,
        maxWindowSize,
      );
      expect(dataClient.getPapers).toHaveBeenNthCalledWith(
        3,
        20,
        maxWindowSize,
      );
      expect(papers).toHaveLength(21); // 10 + 10 + 1
    });

    it('인덱스부여는_정상동작해야한다', async () => {
      // given: 특정 offset 범위의 데이터 조회
      const firstOffset = 5;
      const lastOffset = 7;
      const maxWindowSize = 10;

      const page = createMockPageResponse(5, 10, 3);
      dataClient.getPapers.mockResolvedValueOnce(page);

      // when: offset 범위로 데이터 조회
      const papers = await service.fetchPapersByOffsets(
        firstOffset,
        lastOffset,
        maxWindowSize,
      );

      // then: 각 paper에 올바른 index가 부여되었는지 검증
      expect(papers).toHaveLength(3);
      expect(papers[0].index).toBe(5);
      expect(papers[1].index).toBe(6);
      expect(papers[2].index).toBe(7);
    });
  });

  describe('최적화윈도우조회', () => {
    it('오프셋리밋은_정확하게전달되어야한다', async () => {
      // given: 최적화된 윈도우 목록으로 데이터 조회
      const windows = [
        [0, 5], // offset=0, limit=5
        [20, 3], // offset=20, limit=3
      ];

      const page1 = createMockPageResponse(0, 5, 5);
      const page2 = createMockPageResponse(20, 3, 3);

      dataClient.getPapers.mockResolvedValueOnce(page1);
      dataClient.getPapers.mockResolvedValueOnce(page2);

      // when: 윈도우 목록으로 데이터 조회
      const papers = await service.fetchPapersByWindows(windows);

      // then: 각 윈도우에 대해 올바른 offset과 limit으로 호출되었는지 검증
      expect(dataClient.getPapers).toHaveBeenCalledTimes(2);
      expect(dataClient.getPapers).toHaveBeenNthCalledWith(1, 0, 5);
      expect(dataClient.getPapers).toHaveBeenNthCalledWith(2, 20, 3);
      expect(papers).toHaveLength(8); // 5 + 3
    });

    it('인덱스부여는_정상동작해야한다', async () => {
      // given: 단일 윈도우로 데이터 조회
      const windows = [[10, 3]];

      const page = createMockPageResponse(10, 3, 3);
      dataClient.getPapers.mockResolvedValueOnce(page);

      // when: 윈도우 목록으로 데이터 조회
      const papers = await service.fetchPapersByWindows(windows);

      // then: 각 paper에 올바른 index가 부여되었는지 검증
      expect(papers).toHaveLength(3);
      expect(papers[0].index).toBe(10);
      expect(papers[1].index).toBe(11);
      expect(papers[2].index).toBe(12);
    });
  });

  describe('날짜검증', () => {
    it('정상ISO형식은_유효해야한다', () => {
      // given: 유효한 ISO 형식의 날짜를 가진 paper 데이터
      const validDate = new Date().toISOString();
      const papers = [
        createPaper(0, validDate, validDate, validDate),
        createPaper(1, validDate, validDate, validDate),
      ];

      // when: 유효하지 않은 인덱스 검색
      const invalidIndexes = service.getInvalidPaperIndexes(papers);

      // then: 모든 날짜가 유효하므로 invalidIndexes는 비어있어야 함
      expect(invalidIndexes).toHaveLength(0);
    });

    it('오류날짜는_무효해야한다', () => {
      // given: 일부 날짜 필드만 유효하지 않은 paper 데이터
      const validDate = new Date().toISOString();
      const invalidDate1 = '2024-13-01T10:00:00Z'; // 존재하지 않는 날짜 (13월) → JS 파싱 실패
      const invalidDate2 = 'not-a-date'; // 완전 invalid
      const invalidDate3 = '0O≥-"0nL}.7Z'; // data-server가 실제로 내놓는 형태

      const papers = [
        createPaper(0, validDate, validDate, validDate),
        createPaper(1, invalidDate1, validDate, validDate),
        createPaper(2, validDate, invalidDate2, validDate),
        createPaper(3, validDate, validDate, invalidDate3),
        // 날짜 필드에 null
        createPaper(4, null, validDate, validDate),
        createPaper(5, validDate, null, validDate),
        createPaper(6, validDate, validDate, null),
      ];

      // when: 유효하지 않은 인덱스 검색
      const invalidIndexes = service.getInvalidPaperIndexes(papers);

      // then: 유효하지 않은 날짜를 가진 인덱스들이 반환되어야 함
      expect(invalidIndexes).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  /**
   * 테스트용 mock 페이지 응답 생성
   */
  function createMockPageResponse(
    offset: number,
    limit: number,
    itemCount: number,
  ): PapersPageResponse {
    const items: PaperDto[] = [];
    const validDate = new Date().toISOString();

    for (let i = 0; i < itemCount; i++) {
      items.push({
        id: `id-${offset + i}`,
        researcherId: `researcher-id-${offset + i}`,
        title: `Title ${offset + i}`,
        abstract: `Abstract ${offset + i}`,
        keywords: ['keyword1', 'keyword2'],
        publishedAt: validDate,
        createdAt: validDate,
        updatedAt: validDate,
      });
    }

    const offsetInfo: OffsetInfo = {
      limit,
      offset,
      totalCount: 100,
    };

    return {
      items,
      offsetInfo,
    };
  }

  /**
   * 테스트용 Paper 엔티티 생성
   * 실제 서비스와 동일하게 EtlUtil.parseDate를 사용하여 날짜 파싱
   */
  function createPaper(
    index: number,
    publishedAt: string | null,
    createdAt: string | null,
    updatedAt: string | null,
  ): Paper {
    const paper = new Paper();
    paper.id = `id-${index}`;
    paper.researcherId = `researcher-id-${index}`;
    paper.title = `Title ${index}`;
    paper.abstract = `Abstract ${index}`;
    paper.keywords = ['keyword1', 'keyword2'];
    paper.index = index;

    // 실제 서비스와 동일하게 EtlUtil.parseDate 사용
    paper.publishedAt = EtlUtil.parseDate(publishedAt);
    paper.createdAt = EtlUtil.parseDate(createdAt);
    paper.updatedAt = EtlUtil.parseDate(updatedAt);

    return paper;
  }
});
