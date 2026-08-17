import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ChangePasswordUseCase } from '../../application/auth/change-password.use-case';
import { GetCurrentUserUseCase } from '../../application/auth/get-current-user.use-case';
import { LoginUseCase } from '../../application/auth/login.use-case';
import { AUDIT_LOG_REPOSITORY } from '../../domain/audit/audit-log';
import { USER_REPOSITORY } from '../../domain/user/repositories/user.repository';
import { PrismaAuditLogRepository } from '../../infrastructure/database/prisma/repositories/prisma-audit-log.repository';
import { PrismaUserRepository } from '../../infrastructure/database/prisma/repositories/prisma-user.repository';
import { PasswordService } from '../../infrastructure/security/password.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: (config.get<string>('jwt.expiresIn') ??
            '8h') as `${number}h`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    GetCurrentUserUseCase,
    ChangePasswordUseCase,
    PasswordService,
    JwtStrategy,
    {
      provide: USER_REPOSITORY,
      useClass: PrismaUserRepository,
    },
    {
      provide: AUDIT_LOG_REPOSITORY,
      useClass: PrismaAuditLogRepository,
    },
  ],
  exports: [
    JwtModule,
    PassportModule,
    PasswordService,
    USER_REPOSITORY,
    AUDIT_LOG_REPOSITORY,
  ],
})
export class AuthModule {}
