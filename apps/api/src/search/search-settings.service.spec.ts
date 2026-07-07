import { Test } from '@nestjs/testing';
import { SearchSettingsService } from './search-settings.service';
import { MEILI_CLIENT, PRODUCTS_INDEX } from './search.constants';

interface CapturedSettings {
  searchableAttributes: string[];
  filterableAttributes: string[];
  sortableAttributes: string[];
  rankingRules: string[];
  synonyms: Record<string, string[]>;
}

describe('SearchSettingsService', () => {
  let service: SearchSettingsService;
  let updateSettings: jest.Mock;
  let client: { index: jest.Mock };

  const capturedSettings = (): CapturedSettings => {
    const calls = updateSettings.mock.calls as [CapturedSettings][];
    return calls[0][0];
  };

  beforeEach(async () => {
    updateSettings = jest.fn().mockResolvedValue(undefined);
    client = { index: jest.fn().mockReturnValue({ updateSettings }) };

    const module = await Test.createTestingModule({
      providers: [SearchSettingsService, { provide: MEILI_CLIENT, useValue: client }],
    }).compile();

    service = module.get(SearchSettingsService);
  });

  it('writes to the products index', async () => {
    await service.applySettings();

    expect(client.index).toHaveBeenCalledWith(PRODUCTS_INDEX);
  });

  it('weights searchable attributes name > description > businessName > categoryNames', async () => {
    await service.applySettings();

    expect(capturedSettings().searchableAttributes).toEqual([
      'name',
      'description',
      'businessName',
      'categoryNames',
    ]);
  });

  it('marks the approved-vendor-gate fields and all facet fields filterable', async () => {
    await service.applySettings();

    expect(capturedSettings().filterableAttributes).toEqual(
      expect.arrayContaining([
        'categoryIds',
        'vendorId',
        'vendorStatus',
        'listingType',
        'price',
        'inStock',
        'originCountry',
      ]),
    );
  });

  it('makes price, createdAt, and currency sortable (currency groups price sort so ZAR/NAD never interleave)', async () => {
    await service.applySettings();

    expect(capturedSettings().sortableAttributes).toEqual(
      expect.arrayContaining(['price', 'createdAt', 'currency']),
    );
  });

  it('applies the exact v1 business ranking order: text relevance, then inStock -> reserved slots -> recency -> price', async () => {
    await service.applySettings();

    const rules = capturedSettings().rankingRules;

    const textRelevanceRules = ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'];
    expect(rules.slice(0, textRelevanceRules.length)).toEqual(textRelevanceRules);

    const businessRules = rules.slice(textRelevanceRules.length);
    expect(businessRules).toEqual([
      'inStock:desc',
      'salesVelocity:desc',
      'vendorRating:desc',
      'createdAt:desc',
      'price:asc',
    ]);

    // inStock strictly precedes recency, which strictly precedes price —
    // the exact v1 order from the spec (in_stock boost -> recency -> price),
    // with the two reserved no-op slots in between (deferred signals).
    expect(rules.indexOf('inStock:desc')).toBeLessThan(rules.indexOf('createdAt:desc'));
    expect(rules.indexOf('createdAt:desc')).toBeLessThan(rules.indexOf('price:asc'));
  });

  it('passes through the given synonyms map unchanged', async () => {
    const synonyms = { spf: ['sunscreen'], sunscreen: ['spf'] };

    await service.applySettings(synonyms);

    expect(capturedSettings().synonyms).toBe(synonyms);
  });

  it('defaults to an empty synonyms map when none is given', async () => {
    await service.applySettings();

    expect(capturedSettings().synonyms).toEqual({});
  });
});
