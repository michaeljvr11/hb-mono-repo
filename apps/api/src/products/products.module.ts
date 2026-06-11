import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { FileUrlService } from './upload/file-url.service';
import { Category } from '../categories/entities/category.entity';
import { Vendor } from '../vendors/entities/vendor.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductImage, Vendor, Category])],
  providers: [ProductsService, FileUrlService],
  controllers: [ProductsController],
})
export class ProductsModule {}
