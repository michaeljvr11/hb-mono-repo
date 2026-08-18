import { UnprocessableEntityException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import sharp from 'sharp';
import { ProductImageDimensionsPipe } from './product-image-dimensions.pipe';

jest.mock('fs/promises', () => ({ unlink: jest.fn() }));
jest.mock('sharp');

const mockedSharp = sharp as unknown as jest.Mock;
const mockedUnlink = unlink as jest.Mock;

const stubMetadata = (width?: number, height?: number) => ({
  metadata: jest.fn().mockResolvedValue({ width, height }),
});

const makeFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
  ({
    fieldname: 'images',
    originalname: 'photo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    destination: './uploads/products',
    filename: 'uuid.png',
    path: './uploads/products/uuid.png',
    size: 1024,
    ...overrides,
  }) as Express.Multer.File;

describe('ProductImageDimensionsPipe', () => {
  let pipe: ProductImageDimensionsPipe;

  beforeEach(() => {
    pipe = new ProductImageDimensionsPipe();
    mockedSharp.mockReset();
    mockedUnlink.mockReset().mockResolvedValue(undefined);
  });

  it('returns [] for an empty/undefined file list without probing', async () => {
    await expect(pipe.transform(undefined)).resolves.toEqual([]);
    await expect(pipe.transform([])).resolves.toEqual([]);
    expect(mockedSharp).not.toHaveBeenCalled();
  });

  it('records intrinsic pixel dimensions for a valid image', async () => {
    mockedSharp.mockReturnValue(stubMetadata(1200, 800));
    const file = makeFile();

    const [result] = await pipe.transform([file]);

    expect(mockedSharp).toHaveBeenCalledWith(file.path);
    expect(result.dimensions).toEqual({ width: 1200, height: 800 });
    expect(mockedUnlink).not.toHaveBeenCalled();
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

  it('cleans up every file of the request, not just the offending one, on rejection', async () => {
    const good = makeFile({ filename: 'good.png', path: './uploads/products/good.png' });
    const bad = makeFile({
      filename: 'bad.png',
      path: './uploads/products/bad.png',
      originalname: 'bad.png',
    });
    mockedSharp
      .mockReturnValueOnce(stubMetadata(500, 500))
      .mockReturnValueOnce(stubMetadata(9000, 9000));

    await expect(pipe.transform([good, bad])).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(mockedUnlink).toHaveBeenCalledWith(good.path);
    expect(mockedUnlink).toHaveBeenCalledWith(bad.path);
    expect(mockedUnlink).toHaveBeenCalledTimes(2);
  });

  it('rejects and cleans up when sharp cannot read the file (corrupt/non-image upload)', async () => {
    mockedSharp.mockReturnValue({ metadata: jest.fn().mockRejectedValue(new Error('bad image')) });
    const file = makeFile();

    await expect(pipe.transform([file])).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(mockedUnlink).toHaveBeenCalledWith(file.path);
  });

  it('does not fail the whole batch just because unlink cleanup errors on one file', async () => {
    mockedSharp
      .mockReturnValueOnce(stubMetadata(9000, 9000))
      .mockReturnValueOnce(stubMetadata(500, 500));
    mockedUnlink.mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValueOnce(undefined);

    const files = [makeFile({ filename: 'a.png' }), makeFile({ filename: 'b.png' })];

    await expect(pipe.transform(files)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
