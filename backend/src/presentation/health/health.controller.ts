import { Controller, Get } from '@nestjs/common';
import { CheckHealthUseCase } from '../../application/health/check-health.use-case';
import { Public } from '../auth/auth.decorators';

@Controller('health')
export class HealthController {
  constructor(private readonly checkHealth: CheckHealthUseCase) {}

  @Public()
  @Get()
  check() {
    return this.checkHealth.execute();
  }
}
