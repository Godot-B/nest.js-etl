# API 명세서

## 목차

- [1) 연구자 목록 조회 API](#1-연구자-목록-조회-api)
- [2) 유저를 수집 연구자 데이터와 연동 API](#2-유저를-수집-연구자-데이터와-연동-api)
- [3) 본인(및 논문) 정보 조회 API](#3-본인및-논문-정보-조회-api)
  - [GET /api/me/researcher](#get-apimeresearcher)
  - [GET /api/me/papers](#get-apimepapers)
  - [GET /api/me/papers/{paperId}](#get-apimepaperspaperid)
- [4) 본인(및 논문) 정보 수정 API](#4-본인및-논문-정보-수정-api)
  - [PATCH /api/me/researcher](#patch-apimeresearcher)
  - [PATCH /api/me/papers/{paperId}](#patch-apimepaperspaperid)

# 1) 연구자 목록 조회 API

## `GET` `/api/researchers`

- 가입한 이름을 기반으로 `etlResearcherRaws` 목록 조회
- `etl_researcher_raw`에 `researcher`를 `LEFT JOIN`하여 조회한 리스트를 대상으로 하되 `alreadyRegistered: true` 상태로 보내고, 프론트에서 UX 등 결정.
- 모든 API 응답에서 **항상 프론트에게는 raw_id만을 보내며** 필드명은 `researcherId`, `paperId` 로 보내도록 설계:
  DB 내부의 raw_id 구분을 신경 안써도 되게 함.

### Query Parameters

| name | type | description |
| --- | --- | --- |
| offset | number | 페이지 시작점 |
| size | number | 페이지 크기 |
| query | string? | 이름 검색(optional) |

### Response Body

```json
{
  "researcherChoiceDtos": [
    {
      "researcherId": "4289a8cb-e902-4360-99f4-68b486d7a4a1",
      "name": "육유민",
      "university": "Chungbuk National University",
      "keywords": ["terreo", "debilito", "placeat", "stips"],
      "updatedAt": "2025-11-27T04:17:19.974Z",
      "alreadyRegistered": false
    }
  ],
  "PageInfo": {
    "offset": 0,
    "size": 10,
    "totalCount": 10000
  }
}
```

# 2) 유저를 수집 연구자 데이터와 연동 API

## `POST` `/api/researchers`

- `member_id`와 `etl_researcher_raw_id` 셋팅한 `researcher` 레코드 삽입
- `member_id`와 `etl_paper_raw_id` 셋팅한 `paper` 레코드들 삽입

### Header

- Bearer <ACCESS_TOKEN>

### Request Body

```json
{
  "researcherId": "4289a8cb-e902-4360-99f4-68b486d7a4a1"
}
```

### Response Body

```json
{
  "researcherResultDtos": {
    "id": "4289a8cb-e902-4360-99f4-68b486d7a4a1",
    "memberId": "1d73ac55-0b1e-4d21-a50c-51b712c21875",
    "createdAt": "2025-12-02T03:21:00.000Z",
    "updatedAt": "2025-12-02T03:21:00.000Z"
  },
  "paperResultDtos": [
    {
      "id": "5bbcb518-65ad-4a61-9fe6-92190543b9d3",
      "memberId": "1d73ac55-0b1e-4d21-a50c-51b712c21875",
      "researcherId": "4289a8cb-e902-4360-99f4-68b486d7a4a1",
      "createdAt": "2025-12-02T03:21:00.000Z",
      "updatedAt": "2025-12-02T03:21:00.000Z"
    }
  ]
}
```

# 3) 본인(및 논문) 정보 조회 API

## `GET` `/api/me/researcher`

### Header

- Bearer <ACCESS_TOKEN>

### Response Body

```json
{
  "researcherId": "4289a8cb-e902-4360-99f4-68b486d7a4a1",
  "name": "육유민",
  "university": "Chungbuk National University",
  "city": "양양시",
  "country": "KR",
  "keywords": ["terreo", "debilito", "placeat", "stips"],
  "updatedAt": "2025-12-02T03:21:00.000Z"
}
```

## `GET` `/api/me/papers`

### Header

- Bearer <ACCESS_TOKEN>

### Response Body

```json
{
  "paperDtos": [
    {
      "id": "5bbcb518-65ad-4a61-9fe6-92190543b9d3",
      "title": "Numquam venustas suppellex compono condico amplus sapiente cruciamentum.",
      "keywords": ["ouch", "restructure", "oh", "function", "deafening"],
      "publishedAt": "2018-06-02T09:57:45.709Z",
      "updatedAt": "2025-12-02T03:21:00.000Z"
    }
  ]
}

```

## `GET` `/api/me/papers/{paperId}`

### Header

- Bearer <ACCESS_TOKEN>

### Response Body

```json
{
  "id": "5bbcb518-65ad-4a61-9fe6-92190543b9d3",
  "title": "Numquam venustas suppellex compono condico amplus sapiente cruciamentum.",
  "keywords": ["ouch", "restructure", "oh", "function", "deafening"],
  "publishedAt": "2018-06-02T09:57:45.709Z",
  "updatedAt": "2025-12-02T03:21:00.000Z"
}
```

# 4) 본인(및 논문) 정보 수정 API

## `PATCH` `/api/me/researcher`

### Header

- Bearer <ACCESS_TOKEN>

### Request Body

```json
{
  "university": "Korea University",
  "city": "서울시 성북구",
  "keywords": ["AI", "Machine Learning"]
}
```

### Response Body

```json
{
  "researcherId": "4289a8cb-e902-4360-99f4-68b486d7a4a1",
  "name": "육유민",
  "university": "Korea University",
  "city": "양양시",
  "country": "KR",
  "keywords": ["AI", "Machine Learning"],
  "updatedAt": "2025-12-03T03:21:00.000Z"
}
```

## `PATCH` `/api/me/papers/{paperId}`

### Header

- Bearer <ACCESS_TOKEN>

### Request Body

```json
{
  "title": "My Updated AI Research",
  "keywords": ["AI", "Deep Learning"]
}
```

### Response Body

```json
{
  "id": "5bbcb518-65ad-4a61-9fe6-92190543b9d3",
  "title": "My Updated AI Research",
  "keywords": ["AI", "Deep Learning"],
  "publishedAt": "2018-06-02T09:57:45.709Z",
  "updatedAt": "2025-12-03T03:21:00.000Z"
}
```