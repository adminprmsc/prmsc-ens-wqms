import { Module } from '@nestjs/common';
import { AdminUsersUseCase } from '../../application/admin/admin-users.use-case';
import { GetAccessControlUseCase } from '../../application/admin/get-access-control.use-case';
import { ListAuditLogsUseCase } from '../../application/admin/list-audit-logs.use-case';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminUsersUseCase, ListAuditLogsUseCase, GetAccessControlUseCase],
})
export class AdminModule {}
