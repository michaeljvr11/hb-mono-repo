import { UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { VendorImageDimensionsPipe } from './vendor-image-dimensions.pipe';

jest.mock('sharp');

const mockedSharp = sharp as unknown as jest.Mock;

const stubMetadata = (width?: number, height?: number) => ({
  metadata: jest.fn().mockResolvedValue({ width, height }),
});

const makeFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
  ({
    fieldname: 'file',
    originalname: 'logo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    buffer: Buffer.from('fake-image-bytes'), // memoryStorage (PIO-5)
    size: 1024,
    ...overrides,
  }) as Express.Multer.File;

describe('VendorImageDimensionsPipe', () => {
  let pipe: VendorImageDimensionsPipe;

  beforeEach(() => {
    pipe = new VendorImageDimensionsPipe();
    mockedSharp.mockReset();
  });

  it('probes from file.buffer and attaches dimensions', async () => {
    mockedSharp.mockReturnValue(stubMetadata(500, 500));
    const file = makeFile();

    const result = await pipe.transform(file);

    expect(mockedSharp).toHaveBeenCalledWith(file.buffer);
    expect(result.dimensions).toEqual({ width: 500, height: 500 });
  });

  it('rejects an image over 8000x8000 with a 422 naming actual and allowed dimensions', async () => {
    mockedSharp.mockReturnValue(stubMetadata(9000, 8500));
    const file = makeFile({ originalname: 'huge-banner.png' });

    let error: UnprocessableEntityException | undefined;
    try {
      await pipe.transform(file);
    } catch (e) {
      error = e as UnprocessableEntityException;
    }

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error?.message).toContain('9000x8500px; maximum allowed is 8000x8000px');
  });

  it('rejects when sharp cannot read the buffer at all (corrupt/non-image upload) — 422, not a 500', async () => {
    mockedSharp.mockReturnValue({ metadata: jest.fn().mockRejectedValue(new Error('bad image')) });
    const file = makeFile();

    await expect(pipe.transform(file)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
