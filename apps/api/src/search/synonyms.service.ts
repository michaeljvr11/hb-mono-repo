import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SynonymDto } from '@hb/shared';
import { Synonym } from './entities/synonym.entity';
import { SynonymCreateDto } from './dto/synonym-create.dto';
import { SynonymUpdateDto } from './dto/synonym-update.dto';
import { buildMeilisearchSynonymsMap } from './synonyms-mapper';
import { SearchSettingsService } from './search-settings.service';

/**
 * Admin CRUD over the Postgres-backed synonym table (card #52), sharing the
 * ONE Meilisearch settings-write path from card #47 (SearchSettingsService)
 * — never a second competing writer. Every create/update/delete reapplies
 * the full synonyms map to the live index immediately (no deploy needed),
 * and the same map-building path (buildMeilisearchSynonymsMap, from card
 * #49 — never reimplemented) is reused by the daily full reindex.
 */
@Injectable()
export class SynonymsService {
  constructor(
    @InjectRepository(Synonym) private readonly synonymRepository: Repository<Synonym>,
    private readonly settingsService: SearchSettingsService,
  ) {}

  async findAll(): Promise<SynonymDto[]> {
    const synonyms = await this.synonymRepository.find({ order: { term: 'ASC' } });
    return synonyms.map((s) => this.toDto(s));
  }

  async create(dto: SynonymCreateDto): Promise<SynonymDto> {
    const existing = await this.synonymRepository.findOne({ where: { term: dto.term } });
    if (existing) {
      throw new ConflictException(`A synonym group for term "${dto.term}" already exists`);
    }

    const synonym = this.synonymRepository.create({
      term: dto.term,
      equivalents: dto.equivalents,
      bidirectional: dto.bidirectional ?? true,
      enabled: dto.enabled ?? true,
    });
    const saved = await this.synonymRepository.save(synonym);

    await this.reloadMeilisearchSynonyms();
    return this.toDto(saved);
  }

  async update(id: string, dto: SynonymUpdateDto): Promise<SynonymDto> {
    const synonym = await this.synonymRepository.findOne({ where: { id } });
    if (!synonym) throw new NotFoundException('Synonym group not found');

    if (dto.term && dto.term !== synonym.term) {
      const existing = await this.synonymRepository.findOne({ where: { term: dto.term } });
      if (existing) {
        throw new ConflictException(`A synonym group for term "${dto.term}" already exists`);
      }
    }

    Object.assign(synonym, {
      term: dto.term ?? synonym.term,
      equivalents: dto.equivalents ?? synonym.equivalents,
      bidirectional: dto.bidirectional ?? synonym.bidirectional,
      enabled: dto.enabled ?? synonym.enabled,
    });

    const saved = await this.synonymRepository.save(synonym);

    await this.reloadMeilisearchSynonyms();
    return this.toDto(saved);
  }

  async remove(id: string): Promise<void> {
    const result = await this.synonymRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('Synonym group not found');

    await this.reloadMeilisearchSynonyms();
  }

  /** Reused verbatim by SearchIndexerService's daily full reindex. */
  async buildMeilisearchSynonymsMap(): Promise<Record<string, string[]>> {
    const synonyms = await this.synonymRepository.find();
    return buildMeilisearchSynonymsMap(synonyms);
  }

  private async reloadMeilisearchSynonyms(): Promise<void> {
    const map = await this.buildMeilisearchSynonymsMap();
    await this.settingsService.applySettings(map);
  }

  private toDto(synonym: Synonym): SynonymDto {
    return {
      id: synonym.id,
      term: synonym.term,
      equivalents: synonym.equivalents,
      bidirectional: synonym.bidirectional,
      enabled: synonym.enabled,
      createdAt: synonym.createdAt.toISOString(),
      updatedAt: synonym.updatedAt.toISOString(),
    };
  }
}
