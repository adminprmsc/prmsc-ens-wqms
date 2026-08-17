export enum AuditAction {
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_ACTIVATED = 'USER_ACTIVATED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  PASSWORD_RESET = 'PASSWORD_RESET',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  ROLE_CHANGED = 'ROLE_CHANGED',
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  REPORT_CREATED = 'REPORT_CREATED',
  REPORT_UPDATED = 'REPORT_UPDATED',
  REPORT_SUBMITTED = 'REPORT_SUBMITTED',
  REPORT_APPROVED = 'REPORT_APPROVED',
  REPORT_REJECTED = 'REPORT_REJECTED',
}

export type AuditLogRecord = {
  id: string;
  action: AuditAction;
  actorId: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
  actor?: { id: string; name: string; email: string; role: string } | null;
  target?: { id: string; name: string; email: string; role: string } | null;
};

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

export type CreateAuditLogInput = {
  action: AuditAction;
  actorId?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

export type ListAuditLogsFilter = {
  action?: AuditAction;
  actorId?: string;
  targetId?: string;
  limit?: number;
  offset?: number;
};

export interface AuditLogRepository {
  create(input: CreateAuditLogInput): Promise<AuditLogRecord>;
  list(filter?: ListAuditLogsFilter): Promise<{
    items: AuditLogRecord[];
    total: number;
  }>;
}
