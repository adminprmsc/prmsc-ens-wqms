import { Injectable } from '@nestjs/common';
import type { HealthCheckRepository } from '../../../../domain/health/repositories/health-check.repository';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaHealthCheckRepository implements HealthCheckRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ping(): Promise<boolean> {
    await this.prisma.$queryRawUnsafe('SELECT 1');
    return true;
  }
}
