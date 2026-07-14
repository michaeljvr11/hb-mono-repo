import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Admin-editable search synonym group (card #49). Postgres is the source of
 * truth; the live Meilisearch index synonyms setting is reloaded from this
 * table (see SearchSettingsService / the synonyms→Meilisearch-map mapper in
 * synonyms-mapper.ts) whenever an admin saves a change and on every full
 * reindex — never a static checked-in config file.
 */
@Entity('search_synonyms')
export class Synonym {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Canonical term, e.g. "moisturiser". */
  @Column({ unique: true })
  term: string;

  /** Equivalent terms, e.g. ["moisturizer"]. Postgres text[] column. */
  @Column('text', { array: true })
  equivalents: string[];

  /**
   * When true, each equivalent also maps back to the term and its sibling
   * equivalents (searching "moisturizer" also matches "moisturiser" docs).
   * When false, only term -> equivalents is applied (one-way).
   */
  @Column({ default: true })
  bidirectional: boolean;

  /** Disabled groups are excluded from the live Meilisearch synonyms map. */
  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
