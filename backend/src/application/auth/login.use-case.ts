import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditAction } from '../../domain/audit/audit-log';
import { AUDIT_LOG_REPOSITORY } from '../../domain/audit/audit-log';
import type { AuditLogRepository } from '../../domain/audit/audit-log';
import { USER_REPOSITORY } from '../../domain/user/repositories/user.repository';
import type { UserRepository } from '../../domain/user/repositories/user.repository';
import { toPublicUser, type PublicUser } from '../../domain/user/user';
import { PasswordService } from '../../infrastructure/security/password.service';

export type LoginResult = {
  accessToken: string;
  user: PublicUser;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
};

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogs: AuditLogRepository,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async execute(
    email: string,
    password: string,
    ipAddress?: string,
  ): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.users.findByEmail(normalizedEmail);

    if (!user) {
      await this.auditLogs.create({
        action: AuditAction.LOGIN_FAILED,
        metadata: { email: normalizedEmail, reason: 'unknown_user' },
        ipAddress,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await this.passwords.compare(password, user.passwordHash);
    if (!valid) {
      await this.auditLogs.create({
        action: AuditAction.LOGIN_FAILED,
        actorId: user.id,
        targetId: user.id,
        metadata: { email: normalizedEmail, reason: 'bad_password' },
        ipAddress,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      await this.auditLogs.create({
        action: AuditAction.LOGIN_FAILED,
        actorId: user.id,
        targetId: user.id,
        metadata: { email: normalizedEmail, reason: 'inactive' },
        ipAddress,
      });
      throw new UnauthorizedException('Account is inactive');
    }

    await this.users.update(user.id, { lastLoginAt: new Date() });
    await this.auditLogs.create({
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      targetId: user.id,
      ipAddress,
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: toPublicUser({ ...user, lastLoginAt: new Date() }),
    };
  }
}
