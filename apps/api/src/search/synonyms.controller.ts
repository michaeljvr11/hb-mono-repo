import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@hb/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { SynonymsService } from './synonyms.service';
import { SynonymCreateDto } from './dto/synonym-create.dto';
import { SynonymUpdateDto } from './dto/synonym-update.dto';

/**
 * Admin-only synonym management (card #52). Reuses the existing admin
 * role-guard pattern (@Roles(UserRole.ADMIN), enforced by the global
 * RolesGuard) rather than inventing a new one — deliberately NOT @Public().
 */
@Controller('admin/search/synonyms')
@Roles(UserRole.ADMIN)
export class SynonymsController {
  constructor(private readonly synonymsService: SynonymsService) {}

  @Get()
  findAll() {
    return this.synonymsService.findAll();
  }

  @Post()
  create(@Body() dto: SynonymCreateDto) {
    return this.synonymsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: SynonymUpdateDto) {
    return this.synonymsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.synonymsService.remove(id);
  }
}
