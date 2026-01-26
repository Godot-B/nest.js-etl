import { OffsetInfo } from './offset-info.dto';

export class PapersPageResponse {
  items: PaperDto[];
  offsetInfo: OffsetInfo;
}

export class PaperDto {
  id: string;
  researcherId: string;
  title: string;
  abstract: string;
  keywords: string[];
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}
