import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule, HttpService } from '@nestjs/axios';
import AxiosMockAdapter from 'axios-mock-adapter';
import { DataClient } from './data-client';
import { ResearchersPageResponse } from '../dto/researchers-page-response.dto';
import { OffsetInfo } from '../dto/offset-info.dto';

/**
 * DataClient 테스트
 * API 호출 및 재시도 로직을 검증합니다.
 */
describe('DataClient', () => {
  let dataClient: DataClient;
  let httpService: HttpService;
  let mockAdapter: AxiosMockAdapter;

  beforeEach(async () => {
    // axios-mock-adapter를 사용하여 HTTP 요청을 모킹합니다
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [DataClient],
    }).compile();

    dataClient = module.get<DataClient>(DataClient);
    httpService = module.get<HttpService>(HttpService);
    mockAdapter = new AxiosMockAdapter(httpService.axiosRef);
  });

  afterEach(() => {
    mockAdapter.restore();
  });

  describe('정상응답_처리는_성공해야한다', () => {
    it('should handle successful response', async () => {
      // given: 정상 응답을 반환하는 mock 설정
      const expectedResponse: ResearchersPageResponse = createMockPageResponse(
        0,
        10,
        10,
      );

      mockAdapter.onGet('/researchers').reply(200, expectedResponse);

      // when: API 호출
      const response = await dataClient.getResearchers(0, 10);

      // then: 응답 데이터와 호출 횟수 검증
      expect(response).toBeDefined();
      expect(response.items).toHaveLength(10);
      expect(response.offsetInfo.totalCount).toBe(100);
      expect(mockAdapter.history.get.length).toBe(1);
    });
  });

  describe('에러503_재시도는_성공해야한다', () => {
    it('should retry on 503 error', async () => {
      // given: 503 에러 후 성공 응답을 반환하는 mock 설정
      const successResponse: ResearchersPageResponse = createMockPageResponse(
        0,
        10,
        10,
      );

      // 첫 번째 호출: 503 Service Unavailable 에러
      mockAdapter.onGet('/researchers').replyOnce(503);
      // 두 번째 호출: 성공 응답
      mockAdapter.onGet('/researchers').replyOnce(200, successResponse);

      // when: API 호출 (재시도 로직이 동작해야 함)
      const response = await dataClient.getResearchers(0, 10);

      // then: 재시도 후 성공적으로 데이터를 받아오는지 검증
      expect(response).toBeDefined();
      expect(response.items).toHaveLength(10);
      expect(mockAdapter.history.get.length).toBe(2); // 초기 호출 + 재시도 1회
    });
  });

  describe('에러429_재시도는_성공해야한다', () => {
    it('should retry on 429 error', async () => {
      // given: 429 Too Many Requests 에러 후 성공 응답을 반환하는 mock 설정
      const successResponse: ResearchersPageResponse = createMockPageResponse(
        0,
        10,
        10,
      );

      // 첫 번째 호출: 429 Rate Limit 에러
      mockAdapter.onGet('/researchers').replyOnce(429);
      // 두 번째 호출: 성공 응답
      mockAdapter.onGet('/researchers').replyOnce(200, successResponse);

      // when: API 호출 (재시도 로직이 동작해야 함)
      const response = await dataClient.getResearchers(0, 10);

      // then: 재시도 후 성공적으로 데이터를 받아오는지 검증
      expect(response).toBeDefined();
      expect(response.items).toHaveLength(10);
      expect(mockAdapter.history.get.length).toBe(2); // 초기 호출 + 재시도 1회
    });
  });

  describe('재시도_모두실패시_예외를던져야한다', () => {
    it('should throw exception when all retries fail', async () => {
      // given: 모든 시도가 실패하는 시나리오
      // maxTry=6이므로 attempt 1~6까지 총 6번 호출
      for (let i = 0; i < 6; i++) {
        mockAdapter.onGet('/researchers').replyOnce(503);
      }

      // when & then: 최대 재시도 횟수를 초과하면 예외가 발생해야 함
      await expect(dataClient.getResearchers(0, 10)).rejects.toThrow();

      // maxTry=6이므로 총 6번 호출되었는지 검증
      expect(mockAdapter.history.get.length).toBe(6);
    }, 15000); // 15초로 확장
  });

  /**
   * 테스트용 mock 페이지 응답 생성
   * @param offset 페이지 오프셋
   * @param limit 페이지 크기
   * @param itemCount 실제 반환할 아이템 개수
   */
  function createMockPageResponse(
    offset: number,
    limit: number,
    itemCount: number,
  ): ResearchersPageResponse {
    const items = [];
    const validDate = new Date().toISOString();

    for (let i = 0; i < itemCount; i++) {
      items.push({
        id: `id-${offset + i}`,
        university: `University ${offset + i}`,
        name: `Name ${offset + i}`,
        city: `City ${offset + i}`,
        country: `Country ${offset + i}`,
        keywords: ['keyword1', 'keyword2'],
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
});
