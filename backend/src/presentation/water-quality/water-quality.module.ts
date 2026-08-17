import { Module } from '@nestjs/common';
import { ParseLabDocumentUseCase } from '../../application/water-quality/parse-lab-document.use-case';
import { WaterQualityReportsUseCase } from '../../application/water-quality/water-quality-reports.use-case';
import { WaterQualityController } from './water-quality.controller';

@Module({
  controllers: [WaterQualityController],
  providers: [WaterQualityReportsUseCase, ParseLabDocumentUseCase],
})
export class WaterQualityModule {}
