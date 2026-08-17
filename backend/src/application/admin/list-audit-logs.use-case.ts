import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogRepository,
  type ListAuditLogsFilter,
} from '../../domain/audit/audit-log';

@Injectable()
export class ListAuditLogsUseCase {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogs: AuditLogRepository,
  ) {}

  execute(filter?: ListAuditLogsFilter) {
    return this.auditLogs.list(filter);
  }
}
