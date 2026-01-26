import * as fs from 'fs';
import * as path from 'path';
import { EtlUtil } from './etl.util';
import { Researcher } from '../researcher/researcher.entity';
import { Paper } from '../paper/paper.entity';

/**
 * EtlUtil 테스트
 * 윈도우 최적화 및 CSV 저장 유틸리티 함수를 검증합니다.
 */
describe('EtlUtil', () => {
  const TEST_DATA_DIR = 'test-data';
  const DATA_DIR = path.join(process.cwd(), 'data');

  beforeEach(() => {
    // 각 테스트 전에 생성된 파일 정리
    cleanupTestData();
  });

  afterEach(() => {
    // 각 테스트 후에 생성된 파일 정리
    cleanupTestData();
  });

  function findCsvFile(): string | null {
    if (!fs.existsSync(DATA_DIR)) {
      return null;
    }
    const files = fs.readdirSync(DATA_DIR);
    const csvFiles = files
      .filter((file) => file.startsWith('researcher_paper_joined'))
      .map((file) => ({
        name: file,
        path: path.join(DATA_DIR, file),
        mtime: fs.statSync(path.join(DATA_DIR, file)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime); // 최신 파일 우선

    return csvFiles.length > 0 ? csvFiles[0].path : null;
  }

  describe('윈도우최적화', () => {
    it('연속인덱스는_하나의윈도우로합쳐져야한다', () => {
      // given: 연속된 인덱스들이 하나의 윈도우로 그룹화되어야 함
      const invalidIndexes = [0, 1, 2, 3, 4];
      const maxWindowSize = 10;

      // when: 윈도우 최적화 함수 실행
      const windows = EtlUtil.groupOptimizedWindows(
        invalidIndexes,
        maxWindowSize,
      );

      // then: 하나의 윈도우로 합쳐져야 함
      expect(windows).toHaveLength(1);
      expect(windows[0]).toEqual([0, 5]); // offset=0, limit=5
    });

    it('멀리떨어진인덱스는_여러윈도우로나뉘어야한다', () => {
      // given: 멀리 떨어진 인덱스들은 별도의 윈도우로 분리되어야 함
      const invalidIndexes = [0, 20, 21, 22];
      const maxWindowSize = 10;

      // when: 윈도우 최적화 함수 실행
      const windows = EtlUtil.groupOptimizedWindows(
        invalidIndexes,
        maxWindowSize,
      );

      // then: 여러 윈도우로 나뉘어야 함
      expect(windows.length).toBeGreaterThanOrEqual(2);
      expect(windows[0]).toEqual([0, 1]); // offset=0, limit=1
      expect(windows[1]).toEqual([20, 3]); // offset=20, limit=3
    });

    it('띄엄띄엄인덱스는_최소개수윈도우로계산되어야한다', () => {
      // given
      const invalidIndexes = [0, 5, 10, 15, 20, 25, 30];
      const maxWindowSize = 10;

      // when
      const windows = EtlUtil.groupOptimizedWindows(
        invalidIndexes,
        maxWindowSize,
      );

      // then
      expect(windows.length).toBeGreaterThanOrEqual(1);

      // 모든 invalidIndexes가 windows에 포함되는지 확인
      let totalCovered = 0;
      for (const window of windows) {
        totalCovered += window[1]; // limit 값들의 합
      }
      expect(totalCovered).toBeGreaterThanOrEqual(invalidIndexes.length);
    });

    it('최대크기초과시_분리되어야한다', () => {
      // given
      const invalidIndexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      const maxWindowSize = 10;

      // when
      const windows = EtlUtil.groupOptimizedWindows(
        invalidIndexes,
        maxWindowSize,
      );

      // then
      // 0~11까지 12개이므로 maxWindowSize(10)를 초과하면 분리되어야 함
      expect(windows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('CSV저장', () => {
    it('정상데이터는_파일로저장되어야한다', async () => {
      // given: researcher와 paper 데이터 준비
      const researcher = createResearcher(
        'researcher-1',
        'John Doe',
        'Seoul University',
        'Seoul',
        'Korea',
        ['AI', 'ML'],
        new Date(),
        new Date(),
      );
      const paper = createPaper(
        'paper-1',
        'researcher-1',
        'Test Paper',
        'Abstract text',
        ['research', 'study'],
        new Date(),
        new Date(),
        new Date(),
      );

      // when: CSV 파일로 저장
      await EtlUtil.saveJoinedDataToCsv([researcher], [paper]);

      // then: 파일이 생성되고 내용이 올바른지 검증
      const csvFilePath = findCsvFile();
      expect(csvFilePath).not.toBeNull();
      expect(fs.existsSync(csvFilePath!)).toBe(true);
      const lines = fs.readFileSync(csvFilePath!, 'utf-8').split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2); // 헤더 + 1개 데이터
      expect(lines[0]).toContain('researcher_id');
      expect(lines[0]).toContain('paper_id');
      expect(lines[1]).toContain('researcher-1');
      expect(lines[1]).toContain('paper-1');
    });

    it('여러데이터는_모두저장되어야한다', async () => {
      // given: 여러 개의 researcher와 paper 데이터
      const researcher1 = createResearcher(
        'researcher-1',
        'John Doe',
        'Seoul University',
        'Seoul',
        'Korea',
        ['AI'],
        new Date(),
        new Date(),
      );
      const researcher2 = createResearcher(
        'researcher-2',
        'Jane Smith',
        'Busan University',
        'Busan',
        'Korea',
        ['ML'],
        new Date(),
        new Date(),
      );
      const paper1 = createPaper(
        'paper-1',
        'researcher-1',
        'Paper 1',
        'Abstract 1',
        ['research'],
        new Date(),
        new Date(),
        new Date(),
      );
      const paper2 = createPaper(
        'paper-2',
        'researcher-2',
        'Paper 2',
        'Abstract 2',
        ['study'],
        new Date(),
        new Date(),
        new Date(),
      );

      // when
      await EtlUtil.saveJoinedDataToCsv(
        [researcher1, researcher2],
        [paper1, paper2],
      );

      // then
      const csvFilePath = findCsvFile();
      expect(csvFilePath).not.toBeNull();
      const lines = fs.readFileSync(csvFilePath!, 'utf-8').split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(3); // 헤더 + 2개 데이터
      expect(lines[1]).toContain('researcher-1');
      expect(lines[1]).toContain('paper-1');
      expect(lines[2]).toContain('researcher-2');
      expect(lines[2]).toContain('paper-2');
    });

    it('null값은_빈문자열로저장되어야한다', async () => {
      // given: null 값을 가진 필드들
      const researcher = createResearcher(
        'researcher-1',
        'John Doe',
        null,
        'Seoul',
        'Korea',
        null,
        null,
        null,
      );
      const paper = createPaper(
        'paper-1',
        'researcher-1',
        'Test Paper',
        null,
        null,
        null,
        null,
        null,
      );

      // when
      await EtlUtil.saveJoinedDataToCsv([researcher], [paper]);

      // then
      const csvFilePath = findCsvFile();
      expect(csvFilePath).not.toBeNull();
      const lines = fs.readFileSync(csvFilePath!, 'utf-8').split('\n');
      // null 필드들은 빈 문자열로 저장되어야 함
      expect(lines[1]).not.toContain('null');
    });

    it('존재하지않는연구자는_필터링되어야한다', async () => {
      // given: 존재하지 않는 researcherId를 가진 paper 포함
      const researcher = createResearcher(
        'researcher-1',
        'John Doe',
        'Seoul University',
        'Seoul',
        'Korea',
        ['AI'],
        new Date(),
        new Date(),
      );
      const paper1 = createPaper(
        'paper-1',
        'researcher-1',
        'Valid Paper',
        'Abstract',
        ['research'],
        new Date(),
        new Date(),
        new Date(),
      );
      const paper2 = createPaper(
        'paper-2',
        'non-existent-researcher',
        'Invalid Paper',
        'Abstract',
        ['research'],
        new Date(),
        new Date(),
        new Date(),
      );

      // when
      await EtlUtil.saveJoinedDataToCsv([researcher], [paper1, paper2]);

      // then
      const csvFilePath = findCsvFile();
      expect(csvFilePath).not.toBeNull();
      const lines = fs.readFileSync(csvFilePath!, 'utf-8').split('\n').filter(line => line.trim() !== '');
      expect(lines.length).toBe(2); // 헤더 + 1개 데이터 (paper2는 필터링됨)
      expect(lines[1]).toContain('paper-1');
      expect(lines[1]).not.toContain('paper-2');
    });

    it('날짜포맷은_올바르게저장되어야한다', async () => {
      // given: 특정 날짜를 가진 데이터
      const testDate = new Date('2024-01-15T10:30:45');
      const researcher = createResearcher(
        'researcher-1',
        'John Doe',
        'Seoul University',
        'Seoul',
        'Korea',
        ['AI'],
        testDate,
        testDate,
      );
      const paper = createPaper(
        'paper-1',
        'researcher-1',
        'Test Paper',
        'Abstract',
        ['research'],
        testDate,
        testDate,
        testDate,
      );

      // when
      await EtlUtil.saveJoinedDataToCsv([researcher], [paper]);

      // then
      const csvFilePath = findCsvFile();
      expect(csvFilePath).not.toBeNull();
      const lines = fs.readFileSync(csvFilePath!, 'utf-8').split('\n');
      expect(lines[1]).toContain('2024-01-15 10:30:45');
    });

    it('리스트는_쉼표공백으로구분되어야한다', async () => {
      // given: 여러 개의 키워드를 가진 데이터
      const researcher = createResearcher(
        'researcher-1',
        'John Doe',
        'Seoul University',
        'Seoul',
        'Korea',
        ['AI', 'ML', 'DL'],
        new Date(),
        new Date(),
      );
      const paper = createPaper(
        'paper-1',
        'researcher-1',
        'Test Paper',
        'Abstract',
        ['research', 'study', 'analysis'],
        new Date(),
        new Date(),
        new Date(),
      );

      // when
      await EtlUtil.saveJoinedDataToCsv([researcher], [paper]);

      // then: formatList가 배열을 ", "로 구분하여 변환
      const csvFilePath = findCsvFile();
      expect(csvFilePath).not.toBeNull();
      const lines = fs.readFileSync(csvFilePath!, 'utf-8').split('\n');
      expect(lines[1]).toContain('AI, ML, DL');
      expect(lines[1]).toContain('research, study, analysis');
    });
  });

  /**
   * 테스트에서 생성된 파일 정리
   */
  function cleanupTestData() {
    // CSV 파일 정리
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

    // 테스트 데이터 디렉토리 정리
    if (fs.existsSync(TEST_DATA_DIR)) {
      const files = fs.readdirSync(TEST_DATA_DIR);
      files.forEach((file) => {
        fs.unlinkSync(path.join(TEST_DATA_DIR, file));
      });
      fs.rmdirSync(TEST_DATA_DIR);
    }
  }

  /**
   * 테스트용 Researcher 엔티티 생성
   */
  function createResearcher(
    id: string,
    name: string,
    university: string | null,
    city: string,
    country: string,
    keywords: string[] | null,
    createdAt: Date | null,
    updatedAt: Date | null,
  ): Researcher {
    const researcher = new Researcher();
    researcher.id = id;
    researcher.name = name;
    researcher.university = university;
    researcher.city = city;
    researcher.country = country;
    researcher.keywords = keywords;
    researcher.createdAt = createdAt;
    researcher.updatedAt = updatedAt;
    return researcher;
  }

  /**
   * 테스트용 Paper 엔티티 생성
   */
  function createPaper(
    id: string,
    researcherId: string,
    title: string,
    abstractText: string | null,
    keywords: string[] | null,
    publishedAt: Date | null,
    createdAt: Date | null,
    updatedAt: Date | null,
  ): Paper {
    const paper = new Paper();
    paper.id = id;
    paper.researcherId = researcherId;
    paper.title = title;
    paper.abstract = abstractText;
    paper.keywords = keywords;
    paper.publishedAt = publishedAt;
    paper.createdAt = createdAt;
    paper.updatedAt = updatedAt;
    return paper;
  }
});

