import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AUDIT_LOG_REPOSITORY,
  type AuditLogRepository,
} from '../../domain/audit/audit-log';
import { USER_REPOSITORY } from '../../domain/user/repositories/user.repository';
import type { UserRepository } from '../../domain/user/repositories/user.repository';
import { toPublicUser, type PublicUser } from '../../domain/user/user';
import {
  PASSWORD_POLICY_MESSAGE,
  PasswordService,
} from '../../infrastructure/security/password.service';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogs: AuditLogRepository,
    private readonly passwords: PasswordService,
  ) {}

  async execute(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress?: string,
  ): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user || !user.isActive) {
      throw new NotFoundException('User not found');
    }

    const currentValid = await this.passwords.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!currentValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    if (!PasswordService.meetsPolicy(newPassword)) {
      throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
    }

    const passwordHash = await this.passwords.hash(newPassword);
    const updated = await this.users.update(userId, {
      passwordHash,
      mustChangePassword: false,
    });

    await this.auditLogs.create({
      action: AuditAction.PASSWORD_CHANGED,
      actorId: userId,
      targetId: userId,
      ipAddress,
    });

    return toPublicUser(updated);
  }
}
