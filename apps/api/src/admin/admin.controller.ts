import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { UserRole } from '@hb/shared';
import { AdminService } from './admin.service';
import { AdminOrdersService } from './admin-orders.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AuditService } from '../audit/audit.service';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto';
import { AdminAnalyticsQueryDto } from './dto/admin-analytics-query.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { SetUserActiveDto } from './dto/set-user-active.dto';
import { AuditLogQueryDto } from '../audit/dto/audit-log-query.dto';

@Controller('admin')
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminOrdersService: AdminOrdersService,
    private readonly adminAnalyticsService: AdminAnalyticsService,
    private readonly auditService: AuditService,
  ) {}

  @Get('users')
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id/role')
  updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @GetUser() requestingUser: User,
  ) {
    return this.adminService.updateUserRole(id, dto.role, requestingUser.id);
  }

  @Patch('users/:id/active')
  setUserActive(
    @Param('id') id: string,
    @Body() dto: SetUserActiveDto,
    @GetUser() requestingUser: User,
  ) {
    return this.adminService.setUserActive(id, dto.isActive, requestingUser.id);
  }

  @Get('orders')
  listOrders(@Query() query: AdminOrderQueryDto) {
    return this.adminOrdersService.listOrders(query);
  }

  @Get('dashboard')
  getDashboard() {
    return this.adminOrdersService.getDashboard();
  }

  @Get('analytics')
  getAnalytics(@Query() query: AdminAnalyticsQueryDto) {
    return this.adminAnalyticsService.getSummary(query);
  }

  @Get('audit-logs')
  listAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.auditService.query(query);
  }
}
