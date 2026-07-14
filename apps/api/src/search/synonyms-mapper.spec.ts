import { buildMeilisearchSynonymsMap, SynonymMapperInput } from './synonyms-mapper';

const synonym = (overrides: Partial<SynonymMapperInput> = {}): SynonymMapperInput => ({
  term: 'moisturiser',
  equivalents: ['moisturizer'],
  bidirectional: true,
  enabled: true,
  ...overrides,
});

describe('buildMeilisearchSynonymsMap', () => {
  it('maps a one-way (non-bidirectional) group as term -> equivalents only', () => {
    const map = buildMeilisearchSynonymsMap([
      synonym({ term: 'spf', equivalents: ['sunscreen', 'sunblock'], bidirectional: false }),
    ]);

    expect(map).toEqual({ spf: ['sunscreen', 'sunblock'] });
  });

  it('maps a bidirectional group so every equivalent also finds the term and its siblings', () => {
    const map = buildMeilisearchSynonymsMap([
      synonym({ term: 'spf', equivalents: ['sunscreen', 'sunblock'], bidirectional: true }),
    ]);

    expect(map.spf).toEqual(expect.arrayContaining(['sunscreen', 'sunblock']));
    expect(map.sunscreen).toEqual(expect.arrayContaining(['spf', 'sunblock']));
    expect(map.sunblock).toEqual(expect.arrayContaining(['spf', 'sunscreen']));
  });

  it('excludes disabled synonym groups entirely', () => {
    const map = buildMeilisearchSynonymsMap([synonym({ enabled: false })]);

    expect(map).toEqual({});
  });

  it('normalizes casing and whitespace on both keys and values', () => {
    const map = buildMeilisearchSynonymsMap([
      synonym({ term: '  Moisturiser ', equivalents: [' Moisturizer '] }),
    ]);

    expect(Object.keys(map).sort()).toEqual(['moisturiser', 'moisturizer']);
    expect(map.moisturiser).toEqual(['moisturizer']);
    expect(map.moisturizer).toEqual(['moisturiser']);
  });

  it('merges multiple groups that touch the same key instead of overwriting', () => {
    const map = buildMeilisearchSynonymsMap([
      synonym({ term: 'colour', equivalents: ['color'], bidirectional: false }),
      synonym({ term: 'colour', equivalents: ['hue'], bidirectional: false }),
    ]);

    expect(map.colour).toEqual(expect.arrayContaining(['color', 'hue']));
    expect(map.colour).toHaveLength(2);
  });

  it('skips a group with no equivalents', () => {
    const map = buildMeilisearchSynonymsMap([synonym({ equivalents: [] })]);

    expect(map).toEqual({});
  });

  it('does not create a self-referential entry when term equals an equivalent', () => {
    const map = buildMeilisearchSynonymsMap([
      synonym({ term: 'spf', equivalents: ['spf', 'sunscreen'], bidirectional: true }),
    ]);

    expect(map.spf).toEqual(['sunscreen']);
    expect(map.sunscreen).toEqual(['spf']);
  });

  it('returns an empty map for an empty input', () => {
    expect(buildMeilisearchSynonymsMap([])).toEqual({});
  });
});
