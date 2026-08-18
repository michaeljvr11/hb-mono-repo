import { UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { probeImageDimensions } from './image-dimension-guard';

jest.mock('sharp');

const mockedSharp = sharp as unknown as jest.Mock;

const stubMetadata = (width?: number, height?: number) => ({
  metadata: jest.fn().mockResolvedValue({ width, height }),
});

describe('probeImageDimensions', () => {
  beforeEach(() => mockedSharp.mockReset());

  it('returns intrinsic width/height for a readable image within the cap', async () => {
    mockedSharp.mockReturnValue(stubMetadata(1200, 800));

    const result = await probeImageDimensions(Buffer.from('bytes'), 'photo.png');

    expect(mockedSharp).toHaveBeenCalledWith(Buffer.from('bytes'));
    expect(result).toEqual({ width: 1200, height: 800 });
  });

  it('rejects with 422 above 8000x8000, naming the actual and allowed dimensions', async () => {
    mockedSharp.mockReturnValue(stubMetadata(9000, 8500));

    let error: UnprocessableEntityException | undefined;
    try {
      await probeImageDimensions(Buffer.from('bytes'), 'huge.png');
    } catch (e) {
      error = e as UnprocessableEntityException;
    }

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error?.message).toContain('9000x8500px; maximum allowed is 8000x8000px');
  });

  it('rejects with 422 (not a 500) when sharp cannot read the buffer at all', async () => {
    mockedSharp.mockReturnValue({ metadata: jest.fn().mockRejectedValue(new Error('bad image')) });

    await expect(probeImageDimensions(Buffer.from('bytes'), 'corrupt.png')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects with 422 when sharp resolves with no intrinsic dimensions', async () => {
    mockedSharp.mockReturnValue(stubMetadata(undefined, undefined));

    await expect(probeImageDimensions(Buffer.from('bytes'), 'weird.png')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});
