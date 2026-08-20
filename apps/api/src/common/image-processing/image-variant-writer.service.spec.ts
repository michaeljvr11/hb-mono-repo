import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { ImageVariantWriterService } from './image-variant-writer.service';
import { ProcessedImageVariant } from './image-processor.types';

jest.mock('fs/promises', () => ({ mkdir: jest.fn(), writeFile: jest.fn() }));

const mockedMkdir = mkdir as jest.Mock;
const mockedWriteFile = writeFile as jest.Mock;

const makeVariant = (overrides: Partial<ProcessedImageVariant> = {}): ProcessedImageVariant => ({
  preset: 'full',
  buffer: Buffer.from('fake-webp-bytes'),
  width: 400,
  height: 300,
  sizeBytes: 15,
  format: 'webp',
  ...overrides,
});

describe('ImageVariantWriterService', () => {
  let service: ImageVariantWriterService;

  beforeEach(() => {
    service = new ImageVariantWriterService();
    mockedMkdir.mockReset().mockResolvedValue(undefined);
    mockedWriteFile.mockReset().mockResolvedValue(undefined);
  });

  it('ensures the destination directory exists before writing', async () => {
    await service.write([makeVariant()], '/uploads/products', 'stem-1');

    expect(mockedMkdir).toHaveBeenCalledWith('/uploads/products', { recursive: true });
  });

  it('writes every variant, naming each `<keyStem>-<preset>.<format>`', async () => {
    const variants = [
      makeVariant({ preset: 'thumbnail' }),
      makeVariant({ preset: 'card' }),
      makeVariant({ preset: 'full' }),
    ];

    const written = await service.write(variants, '/uploads/products', 'abc-123');

    expect(written.map((w) => w.filename)).toEqual([
      'abc-123-thumbnail.webp',
      'abc-123-card.webp',
      'abc-123-full.webp',
    ]);
    expect(written.map((w) => w.path)).toEqual([
      join('/uploads/products', 'abc-123-thumbnail.webp'),
      join('/uploads/products', 'abc-123-card.webp'),
      join('/uploads/products', 'abc-123-full.webp'),
    ]);
    expect(mockedWriteFile).toHaveBeenCalledTimes(3);
  });

  // AC5 regression: the stored extension always comes from the processor's fixed output
  // format, never from anything client-supplied. This writer's API doesn't even accept an
  // `originalname`/mimetype — there is no code path by which one could leak into the
  // filename, unlike the pre-PIO-2 diskStorage filename callback this replaces.
  it('always writes a .webp extension regardless of preset name', async () => {
    const written = await service.write(
      [makeVariant({ preset: 'anything-a-caller-names-it' })],
      '/uploads/vendors',
      'stem',
    );

    expect(written[0].filename).toBe('stem-anything-a-caller-names-it.webp');
    expect(written[0].filename.endsWith('.webp')).toBe(true);
  });

  it('writes the exact buffer produced by the processor', async () => {
    const variant = makeVariant({ buffer: Buffer.from('specific-bytes') });

    await service.write([variant], '/uploads/products', 'stem');

    expect(mockedWriteFile).toHaveBeenCalledWith(
      join('/uploads/products', 'stem-full.webp'),
      variant.buffer,
    );
  });

  it('propagates width/height/sizeBytes from the processed variant unchanged', async () => {
    const variant = makeVariant({ width: 800, height: 450, sizeBytes: 123456 });

    const [written] = await service.write([variant], '/uploads/products', 'stem');

    expect(written.width).toBe(800);
    expect(written.height).toBe(450);
    expect(written.sizeBytes).toBe(123456);
  });

  it('returns an empty array for an empty variant list (still creates the directory)', async () => {
    const written = await service.write([], '/uploads/products', 'stem');

    expect(written).toEqual([]);
    expect(mockedMkdir).toHaveBeenCalled();
  });
});
