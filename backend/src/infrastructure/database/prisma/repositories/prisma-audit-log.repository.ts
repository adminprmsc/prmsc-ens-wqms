import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  type AuditLogRecord,
  type CreateAuditLogInput,
  type ListAuditLogsFilter,
  type AuditLogRepository,
} from '../../../../domain/audit/audit-log';
import { PrismaService } from '../prisma.service';

type AuditUserRef = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type AuditLogRow = {
  id: string;
  action: string;
  actorId: string | null;
  targetId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: Date;
  actor: AuditUserRef | null;
  target: AuditUserRef | null;
};

const auditUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    const row = (await this.prisma.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId ?? null,
        targetId: input.targetId ?? null,
        metadata:
          input.metadata === undefined || input.metadata === null
            ? undefined
            : (input.metadata as Prisma.InputJsonValue),
        ipAddress: input.ipAddress ?? null,
      },
      include: {
        actor: { select: auditUserSelect },
        target: { select: auditUserSelect },
      },
    })) as AuditLogRow;

    return this.map(row);
  }

  async list(
    filter: ListAuditLogsFilter = {},
  ): Promise<{ items: AuditLogRecord[]; total: number }> {
    const where = {
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.targetId ? { targetId: filter.targetId } : {}),
    };

    const limit = Math.min(filter.limit ?? 50, 200);
    const offset = filter.offset ?? 0;

    const [rawItems, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: auditUserSelect },
          target: { select: auditUserSelect },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const items = rawItems as AuditLogRow[];

    return {
      items: items.map((item) => this.map(item)),
      total,
    };
  }

  private map(log: AuditLogRow): AuditLogRecord {
    return {
      id: log.id,
      action: log.action as AuditAction,
      actorId: log.actorId,
      targetId: log.targetId,
      metadata:
        log.metadata && typeof log.metadata === 'object'
          ? (log.metadata as Record<string, unknown>)
          : null,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      actor: log.actor,
      target: log.target,
    };
  }
}
