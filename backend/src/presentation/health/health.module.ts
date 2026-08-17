import { Module } from '@nestjs/common';
import { CheckHealthUseCase } from '../../application/health/check-health.use-case';
import { HEALTH_CHECK_REPOSITORY } from '../../domain/health/repositories/health-check.repository';
import { PrismaHealthCheckRepository } from '../../infrastructure/database/prisma/repositories/prisma-health-check.repository';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    CheckHealthUseCase,
    {
      provide: HEALTH_CHECK_REPOSITORY,
      useClass: PrismaHealthCheckRepository,
    },
  ],
})
export class HealthModule {}
