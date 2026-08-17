import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';

@Injectable()
export class LocationsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  listTehsils() {
    return this.prisma.tehsil.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        _count: { select: { villages: true } },
      },
    });
  }

  async listVillages(tehsilId: string) {
    const tehsil = await this.prisma.tehsil.findUnique({
      where: { id: tehsilId },
    });
    if (!tehsil) {
      throw new NotFoundException('Tehsil not found');
    }

    return this.prisma.village.findMany({
      where: { tehsilId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        tehsilId: true,
        _count: { select: { settlements: true } },
      },
    });
  }

  async listSettlements(villageId: string) {
    const village = await this.prisma.village.findUnique({
      where: { id: villageId },
    });
    if (!village) {
      throw new NotFoundException('Village not found');
    }

    return this.prisma.settlement.findMany({
      where: { villageId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        villageId: true,
      },
    });
  }
}
