import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@hb/shared';
import { ProductsService } from './products.service';
import { ProductCreateDto } from './dto/product-create.dto';
import { ProductUpdateDto } from './dto/product-update.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { productImageMulterOptions } from './upload/multer.config';
import { productImageFilePipe } from './upload/product-image-file.pipe';
import {
  productImageDimensionsPipe,
  ProbedProductImageFile,
} from './upload/product-image-dimensions.pipe';
import { Public } from '../common/decorators/public.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { User } from '../users/entities/user.entity';

@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.VENDOR, UserRole.ADMIN)
  @UseInterceptors(FilesInterceptor('images', 8, productImageMulterOptions))
  async create(
    @Body() createDto: ProductCreateDto,
    // Chained pipes: mimetype/size first (productImageFilePipe), then the intrinsic
    // pixel-dimension probe + 8000x8000 cap (productImageDimensionsPipe) — see
    // apps/api/src/products/upload/*.pipe.ts for the rejection + disk-cleanup behaviour.
    @UploadedFiles(productImageFilePipe, productImageDimensionsPipe)
    files: ProbedProductImageFile[] = [],
    @GetUser() user: User,
  ) {
    return this.productsService.createWithImages(createDto, files, user);
  }

  @Public()
  @Get()
  getAllProducts(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query);
  }

  @Public()
  @Get(':id')
  getProductById(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Patch(':id')
  updateProduct(
    @Param('id') id: string,
    @Body() productDto: ProductUpdateDto,
    @GetUser() user: User,
  ) {
    return this.productsService.update(id, productDto, user);
  }

  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  deleteProduct(@Param('id') id: string, @GetUser() user: User) {
    return this.productsService.remove(id, user);
  }
}
