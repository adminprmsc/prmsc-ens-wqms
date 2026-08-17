import { Inject, Injectable } from '@nestjs/common';
import { HEALTH_CHECK_REPOSITORY } from '../../domain/health/repositories/health-check.repository';
import type { HealthCheckRepository } from '../../domain/health/repositories/health-check.repository';

export type HealthCheckResult = {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  timestamp: string;
};

@Injectable()
export class CheckHealthUseCase {
  constructor(
    @Inject(HEALTH_CHECK_REPOSITORY)
    private readonly healthCheckRepository: HealthCheckRepository,
  ) {}

  async execute(): Promise<HealthCheckResult> {
    let database: 'up' | 'down' = 'down';

    try {
      await this.healthCheckRepository.ping();
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
