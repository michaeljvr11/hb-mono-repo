import { UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { ProductImageDimensionsPipe } from './product-image-dimensions.pipe';

jest.mock('sharp');

const mockedSharp = sharp as unknown as jest.Mock;

const stubMetadata = (width?: number, height?: number) => ({
  metadata: jest.fn().mockResolvedValue({ width, height }),
});

const makeFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
  ({
    fieldname: 'images',
    originalname: 'photo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    // memoryStorage (PIO-2): no `destination`/`filename`/`path` — buffer is the payload.
    buffer: Buffer.from('fake-image-bytes'),
    size: 1024,
    ...overrides,
  }) as Express.Multer.File;

describe('ProductImageDimensionsPipe', () => {
  let pipe: ProductImageDimensionsPipe;

  beforeEach(() => {
    pipe = new ProductImageDimensionsPipe();
    mockedSharp.mockReset();
  });

  it('returns [] for an empty/undefined file list without probing', async () => {
    await expect(pipe.transform(undefined)).resolves.toEqual([]);
    await expect(pipe.transform([])).resolves.toEqual([]);
    expect(mockedSharp).not.toHaveBeenCalled();
  });

  it('probes from file.buffer, not file.path (memoryStorage — PIO-2), and returns the file(s) unchanged', async () => {
    mockedSharp.mockReturnValue(stubMetadata(1200, 800));
    const file = makeFile();

    const result = await pipe.transform([file]);

    expect(mockedSharp).toHaveBeenCalledWith(file.buffer);
    expect(result).toEqual([file]);
  });

  it('rejects an image over 8000x8000 with a 422 naming actual and allowed dimensions', async () => {
    mockedSharp.mockReturnValue(stubMetadata(9000, 8500));
    const file = makeFile({ originalname: 'huge.png' });

    let error: UnprocessableEntityException | undefined;
    try {
      await pipe.transform([file]);
    } catch (e) {
      error = e as UnprocessableEntityException;
    }

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error?.message).toContain('9000x8500px; maximum allowed is 8000x8000px');
  });

  it('rejects the whole batch if any one file in a multi-file upload fails validation', async () => {
    mockedSharp
      .mockReturnValueOnce(stubMetadata(500, 500))
      .mockReturnValueOnce(stubMetadata(9000, 9000));

    const files = [makeFile({ originalname: 'good.png' }), makeFile({ originalname: 'bad.png' })];

    await expect(pipe.transform(files)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects when sharp cannot read the buffer at all (corrupt/non-image upload) — 422, not a 500', async () => {
    mockedSharp.mockReturnValue({ metadata: jest.fn().mockRejectedValue(new Error('bad image')) });
    const file = makeFile();

    await expect(pipe.transform([file])).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
