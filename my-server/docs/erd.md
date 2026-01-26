## 핵심 테이블 ERD

<div align="center">
  <img src="images/erd-PART 2.png" alt="ERD-PART 2" width="60%">
</div>

data-server 의 구조에 맞춰서, `researcher`와 `paper`는 논문이 주어지면 담당 연구자 1명이 결정되는 1:N 관계를 채택하였습니다.

### 로그인 유저 정보

- member
    - `status`
        - `PENDING`
        - `ACTIVE`
        - `INACTIVE` (180일 프로필 수정 없음 등)
        - `DELETED` (유저 스스로 탈퇴 등)
    - `created_at`
    - `updated_at`
    - 로그인 관련 필드 (토큰, id 또는 email, password, … 등)
        - 요구사항이 있다면 추가

### Override 테이블
> - raw 데이터 선택(연결) 시 삽입
> - 수정/작성한 필드만 저장 & 나머지는 null
- researcher
    - `member_id` `FK UNIQUE` (1:1)
    - `etl_researcher_raw_id`  `FK UNIQUE` (1:1)
    - `created_at`
        - raw 데이터를 연결한 시간과 동일
    - `updated_at`
        - 180일동안 프로필 수정이 없었는지 검증의 대상이 되는 필드
- paper
    - `member_id`  `FK` (1:N)
        - member 본인의 논문 정보에 바로 접근해야 하므로
    - `researcher_id`  `FK` (1:N)
        - raw 데이터의 관계를 그대로
    - `etl_paper_raw_id`  `FK UNIQUE` (1:1)
    - `created_at`
        - raw 데이터를 연결한 시간과 동일
    - `updated_at`

### ETL 수집 데이터

- etl_researcher_raw
    - (PART 1과 동일)
- etl_paper_raw
    - (PART 1과 동일)
