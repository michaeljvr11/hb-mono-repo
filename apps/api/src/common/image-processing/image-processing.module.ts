import { Module } from '@nestjs/common';
import { ImageProcessorService } from './image-processor.service';
import { ImageVariantWriterService } from './image-variant-writer.service';

/**
 * The reusable resize/re-encode pipeline (PIO-2). Product images import it today;
 * PIO-5 imports the same module for vendor logo/banner uploads with its own presets and
 * destination directory — nothing here is product-specific.
 */
@Module({
  providers: [ImageProcessorService, ImageVariantWriterService],
  exports: [ImageProcessorService, ImageVariantWriterService],
})
export class ImageProcessingModule {}
