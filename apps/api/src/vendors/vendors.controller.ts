import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@hb/shared';
import { VendorsService } from './vendors.service';
import { VendorAnalyticsService } from './vendor-analytics.service';
import { VendorEarningsReportService } from './vendor-earnings-report.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { AdminCreateVendorDto } from './dto/admin-create-vendor.dto';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { VendorAnalyticsQueryDto } from './dto/vendor-analytics-query.dto';
import { VendorEarningsQueryDto } from './dto/vendor-earnings-query.dto';
import { vendorImageMulterOptions } from './upload/vendor-image.multer.config';
import { vendorImageFilePipe } from './upload/vendor-image-file.pipe';
import { vendorImageDimensionsPipe } from './upload/vendor-image-dimensions.pipe';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('vendors')
export class VendorsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly vendorAnalyticsService: VendorAnalyticsService,
    private readonly vendorEarningsReportService: VendorEarningsReportService,
  ) {}

  // Admin only for now; public vendor directory later
  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.vendorsService.findAll();
  }

  // Admin can create vendors for any user (or none — pending onboarding)
  @Post('admin')
  @Roles(UserRole.ADMIN)
  adminCreate(@Body() dto: AdminCreateVendorDto) {
    return this.vendorsService.adminCreate(dto);
  }

  @Post()
  @Roles(UserRole.CUSTOMER, UserRole.VENDOR)
  create(@Body() createDto: CreateVendorDto, @GetUser() user: User) {
    return this.vendorsService.create(createDto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateVendorStatusDto,
    @GetUser() user: User,
  ) {
    return this.vendorsService.updateStatus(id, body.status, user.id);
  }

  @Public()
  @Get('directory')
  findDirectory() {
    return this.vendorsService.findDirectory();
  }

  @Get('me')
  @Roles(UserRole.VENDOR)
  getMyVendorProfile(@GetUser() user: User) {
    return this.vendorsService.findByUserId(user.id);
  }

  @Get('me/dashboard')
  @Roles(UserRole.VENDOR)
  getMyDashboard(@GetUser() user: User) {
    return this.vendorsService.getDashboard(user.id);
  }

  @Get('me/analytics')
  @Roles(UserRole.VENDOR)
  getMyAnalytics(@Query() query: VendorAnalyticsQueryDto, @GetUser() user: User) {
    return this.vendorAnalyticsService.getAnalytics(user.id, query);
  }

  @Get('me/earnings')
  @Roles(UserRole.VENDOR)
  getMyEarnings(@Query() query: VendorEarningsQueryDto, @GetUser() user: User) {
    return this.vendorEarningsReportService.getMyEarnings(user.id, query);
  }

  @Post('me/logo')
  @Roles(UserRole.VENDOR)
  @UseInterceptors(FileInterceptor('file', vendorImageMulterOptions))
  uploadLogo(
    // Chained pipes: mimetype/size first (vendorImageFilePipe), then the intrinsic
    // pixel-dimension probe + 8000x8000 cap (vendorImageDimensionsPipe) — mirrors
    // ProductsController.create (PIO-1/PIO-5).
    @UploadedFile(vendorImageFilePipe, vendorImageDimensionsPipe) file: Express.Multer.File,
    @GetUser() user: User,
  ) {
    return this.vendorsService.updateLogo(user.id, file);
  }

  @Post('me/banner')
  @Roles(UserRole.VENDOR)
  @UseInterceptors(FileInterceptor('file', vendorImageMulterOptions))
  uploadBanner(
    @UploadedFile(vendorImageFilePipe, vendorImageDimensionsPipe) file: Express.Multer.File,
    @GetUser() user: User,
  ) {
    return this.vendorsService.updateBanner(user.id, file);
  }

  // Public so anonymous/SSR-rendered vendor-profile pages can fetch without a token
  // (parity with @Public() GET /vendors/directory). Approved-only filter lives in the
  // service so the public :id path matches directory visibility — no pending/rejected/
  // suspended leak, and the lean VendorResponseDto keeps admin-only PII out of the response.
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.VENDOR, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() updateDto: UpdateVendorDto, @GetUser() user: User) {
    return this.vendorsService.update(id, updateDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.vendorsService.remove(id);
  }
}
