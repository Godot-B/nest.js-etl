import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('paper')
export class Paper {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({
    name: 'researcher_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  researcherId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string;

  @Column({ name: 'abstract', type: 'text', nullable: true })
  abstract: string;

  @Column({ type: 'jsonb', nullable: true })
  keywords: string[];

  @Column({ name: 'published_at', type: 'timestamp', nullable: true })
  publishedAt: Date;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date;

  // Transient field for ETL processing
  index?: number;
}
