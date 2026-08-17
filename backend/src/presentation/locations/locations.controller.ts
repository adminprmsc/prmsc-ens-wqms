import { Controller, Get, Param } from '@nestjs/common';
import { LocationsUseCase } from '../../application/locations/locations.use-case';
import { UserRole } from '../../domain/user/user';
import { Roles } from '../auth/auth.decorators';

@Controller('locations')
@Roles(UserRole.SYSTEM_ADMIN, UserRole.SUPER_ADMIN, UserRole.USER)
export class LocationsController {
  constructor(private readonly locations: LocationsUseCase) {}

  @Get('tehsils')
  listTehsils() {
    return this.locations.listTehsils();
  }

  @Get('tehsils/:tehsilId/villages')
  listVillages(@Param('tehsilId') tehsilId: string) {
    return this.locations.listVillages(tehsilId);
  }

  @Get('villages/:villageId/settlements')
  listSettlements(@Param('villageId') villageId: string) {
    return this.locations.listSettlements(villageId);
  }
}
