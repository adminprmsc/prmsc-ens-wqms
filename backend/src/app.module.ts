import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { GetAppInfoUseCase } from './application/app/get-app-info.use-case';
import configuration from './infrastructure/config/configuration';
import { validate } from './infrastructure/config/env.validation';
import { PrismaModule } from './infrastructure/database/prisma/prisma.module';
import { AdminModule } from './presentation/admin/admin.module';
import { AppController } from './presentation/app/app.controller';
import { AuthModule } from './presentation/auth/auth.module';
import { JwtAuthGuard } from './presentation/auth/jwt-auth.guard';
import { RolesGuard } from './presentation/auth/roles.guard';
import { HealthModule } from './presentation/health/health.module';
import { LocationsModule } from './presentation/locations/locations.module';
import { WaterQualityModule } from './presentation/water-quality/water-quality.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    AdminModule,
    LocationsModule,
    WaterQualityModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    GetAppInfoUseCase,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
