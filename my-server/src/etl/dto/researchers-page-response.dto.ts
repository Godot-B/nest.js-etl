import { OffsetInfo } from './offset-info.dto';

export class ResearchersPageResponse {
  items: ResearcherDto[];
  offsetInfo: OffsetInfo;
}

export class ResearcherDto {
  id: string;
  university: string;
  name: string;
  city: string;
  country: string;
  keywords: string[];
  createdAt: string;
  updatedAt: string;
}
