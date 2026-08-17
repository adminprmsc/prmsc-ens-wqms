import { Module } from '@nestjs/common';
import { LocationsUseCase } from '../../application/locations/locations.use-case';
import { LocationsController } from './locations.controller';

@Module({
  controllers: [LocationsController],
  providers: [LocationsUseCase],
})
export class LocationsModule {}
