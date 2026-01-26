export class ResearcherPaperJoinDto {
  // Researcher 필드
  researcherId: string;
  researcherName: string;
  university: string;
  city: string;
  country: string;
  researcherKeywords: string[];
  researcherCreatedAt: Date;
  researcherUpdatedAt: Date;

  // Paper 필드
  paperId: string;
  title: string;
  abstractText: string;
  paperKeywords: string[];
  publishedAt: Date;
  paperCreatedAt: Date;
  paperUpdatedAt: Date;
}
