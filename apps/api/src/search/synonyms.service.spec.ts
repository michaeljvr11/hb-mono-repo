import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SynonymsService } from './synonyms.service';
import { SearchSettingsService } from './search-settings.service';
import { Synonym } from './entities/synonym.entity';

const NOW = new Date('2026-06-01T10:00:00.000Z');

const makeSynonym = (overrides: Partial<Synonym> = {}): Synonym => ({
  id: 's1',
  term: 'spf',
  equivalents: ['sunscreen'],
  bidirectional: true,
  enabled: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('SynonymsService', () => {
  let service: SynonymsService;
  let repo: Record<string, jest.Mock>;
  let settingsService: { applySettings: jest.Mock };

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data: Partial<Synonym>) => ({ ...data }) as Synonym),
      save: jest
        .fn()
        .mockImplementation((s: Synonym) =>
          Promise.resolve({ id: 's1', createdAt: NOW, updatedAt: NOW, ...s }),
        ),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    settingsService = { applySettings: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        SynonymsService,
        { provide: getRepositoryToken(Synonym), useValue: repo },
        { provide: SearchSettingsService, useValue: settingsService },
      ],
    }).compile();

    service = module.get(SynonymsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('maps entities to SynonymDto with ISO date strings', async () => {
      repo.find.mockResolvedValue([makeSynonym()]);

      const result = await service.findAll();

      expect(result).toEqual([
        {
          id: 's1',
          term: 'spf',
          equivalents: ['sunscreen'],
          bidirectional: true,
          enabled: true,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        },
      ]);
    });
  });

  describe('create', () => {
    it('creates a synonym group and reloads the live Meilisearch synonyms setting', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.find.mockResolvedValue([makeSynonym()]); // used by the reload's map-build

      const result = await service.create({ term: 'spf', equivalents: ['sunscreen'] });

      expect(result.term).toBe('spf');
      expect(settingsService.applySettings).toHaveBeenCalledTimes(1);
      const [synonymsMap] = settingsService.applySettings.mock.calls[0] as [
        Record<string, string[]>,
      ];
      expect(synonymsMap.spf).toEqual(['sunscreen']);
    });

    it('rejects a duplicate term with ConflictException and does not reload settings', async () => {
      repo.findOne.mockResolvedValue(makeSynonym());

      await expect(service.create({ term: 'spf', equivalents: ['sunblock'] })).rejects.toThrow(
        ConflictException,
      );
      expect(settingsService.applySettings).not.toHaveBeenCalled();
    });

    it('defaults bidirectional and enabled to true when omitted', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.create({ term: 'spf', equivalents: ['sunscreen'] });

      const created = (repo.create.mock.calls[0] as [Partial<Synonym>])[0];
      expect(created.bidirectional).toBe(true);
      expect(created.enabled).toBe(true);
    });
  });

  describe('update', () => {
    it('updates fields and reloads settings', async () => {
      repo.findOne.mockResolvedValueOnce(makeSynonym());

      const result = await service.update('s1', { enabled: false });

      expect(result.enabled).toBe(false);
      expect(settingsService.applySettings).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException for a missing id', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update('missing', { enabled: false })).rejects.toThrow(
        NotFoundException,
      );
      expect(settingsService.applySettings).not.toHaveBeenCalled();
    });

    it('rejects renaming to a term that already exists on another group', async () => {
      repo.findOne
        .mockResolvedValueOnce(makeSynonym({ id: 's1', term: 'spf' }))
        .mockResolvedValueOnce(makeSynonym({ id: 's2', term: 'colour' }));

      await expect(service.update('s1', { term: 'colour' })).rejects.toThrow(ConflictException);
      expect(settingsService.applySettings).not.toHaveBeenCalled();
    });

    it('allows updating a group to keep its own existing term', async () => {
      repo.findOne.mockResolvedValueOnce(makeSynonym({ id: 's1', term: 'spf' }));

      await expect(
        service.update('s1', { term: 'spf', equivalents: ['sunblock'] }),
      ).resolves.toBeDefined();
    });
  });

  describe('remove', () => {
    it('deletes and reloads settings', async () => {
      await service.remove('s1');

      expect(repo.delete).toHaveBeenCalledWith('s1');
      expect(settingsService.applySettings).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when nothing was deleted', async () => {
      repo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(settingsService.applySettings).not.toHaveBeenCalled();
    });
  });

  describe('buildMeilisearchSynonymsMap', () => {
    it('delegates to the shared mapper (card #49), reused verbatim', async () => {
      repo.find.mockResolvedValue([
        makeSynonym({ term: 'spf', equivalents: ['sunscreen'], bidirectional: false }),
      ]);

      const map = await service.buildMeilisearchSynonymsMap();

      expect(map).toEqual({ spf: ['sunscreen'] });
    });
  });
});
