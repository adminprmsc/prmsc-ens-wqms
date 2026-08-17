import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminUsersUseCase } from '../../application/admin/admin-users.use-case';
import { GetAccessControlUseCase } from '../../application/admin/get-access-control.use-case';
import { ListAuditLogsUseCase } from '../../application/admin/list-audit-logs.use-case';
import { UserRole } from '../../domain/user/user';
import {
  clientIp,
  CurrentUser,
  Roles,
  type AuthUser,
} from '../auth/auth.decorators';
import {
  ListAuditLogsQueryDto,
  ListUsersQueryDto,
} from './dto/admin-query.dto';
import {
  CreateUserDto,
  ResetPasswordDto,
  SetUserStatusDto,
  UpdateUserDto,
} from './dto/admin-users.dto';

@Controller('admin')
@Roles(UserRole.SYSTEM_ADMIN)
export class AdminController {
  constructor(
    private readonly adminUsers: AdminUsersUseCase,
    private readonly listAuditLogs: ListAuditLogsUseCase,
    private readonly getAccessControl: GetAccessControlUseCase,
  ) {}

  @Get('users')
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminUsers.list({
      role: query.role,
      search: query.search,
      isActive:
        query.isActive === undefined
          ? undefined
          : query.isActive === 'true'
            ? true
            : query.isActive === 'false'
              ? false
              : undefined,
    });
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.adminUsers.getById(id);
  }

  @Post('users')
  createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.adminUsers.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      autoGeneratePassword: dto.autoGeneratePassword,
      role: dto.role,
      organization: dto.organization,
      actorId: actor.id,
      ipAddress: clientIp(req),
    });
  }

  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.adminUsers.update({
      userId: id,
      name: dto.name,
      organization: dto.organization,
      role: dto.role,
      actorId: actor.id,
      ipAddress: clientIp(req),
    });
  }

  @Patch('users/:id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.adminUsers.setActive(id, dto.isActive, actor.id, clientIp(req));
  }

  @Post('users/:id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.adminUsers.resetPassword(
      id,
      actor.id,
      dto.password,
      clientIp(req),
    );
  }

  @Get('audit-logs')
  auditLogs(@Query() query: ListAuditLogsQueryDto) {
    return this.listAuditLogs.execute({
      action: query.action,
      actorId: query.actorId,
      targetId: query.targetId,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('access-control')
  accessControl() {
    return this.getAccessControl.execute();
  }
}
