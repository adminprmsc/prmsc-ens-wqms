import { BadRequestException, Injectable } from '@nestjs/common';
import {
  LabDocumentExtractionError,
  parseLabDocument,
} from '../../domain/water-quality/lab-document-extractor';
import {
  matchLocationHierarchy,
  settlementHintFromReport,
} from '../../domain/water-quality/location-matcher';
import { matchSourceType } from '../../domain/water-quality/source-type-matcher';
import { DEFAULT_SOURCE_TYPE_BY_CATEGORY } from '../../domain/water-quality/source-types.catalog';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';

export type ParsedDocumentResponse = {
  sourceFileName: string;
  confidence: number;
  warnings: string[];
  formType: 'PRIORITY' | 'FULL';
  sampleType: 'SOURCE_WELL' | 'POU_TAP' | 'OHR';
  reportCategory: 'PCRWR' | 'BASELINE';
  fields: {
    reportSerialNo: string | null;
    nwqlSampleCode: string | null;
    customerCode: string | null;
    customerName: string | null;
    customerAddress: string | null;
    customerPhone: string | null;
    locationDetail: string | null;
    workOrder: string | null;
    sourceLabel: string | null;
    documentTehsilName: string | null;
    documentVillageName: string | null;
    siteName: string | null;
    totalPages: number | null;
    samplingAt: string | null;
    receivedAt: string | null;
    receiptTempC: number | null;
    receiptHumidityPct: number | null;
    analysisFrom: string | null;
    analysisTo: string | null;
    reportingDate: string | null;
    remarksOverride: string | null;
  };
  location: {
    tehsilId: string | null;
    tehsilName: string | null;
    villageId: string | null;
    villageName: string | null;
    settlementId: string | null;
    settlementName: string | null;
    siteName: string | null;
    score: number;
    linked: boolean;
  };
  source: {
    sourceTypeId: string | null;
    code: string | null;
    name: string | null;
    category: 'SOURCE_WELL' | 'POU_TAP' | 'OHR';
    sourceLabel: string | null;
    matched: boolean;
  };
  results: Array<{
    parameterCode: string;
    parameterName: string;
    rawValue: string;
    resultType: string;
    numericValue: number | null;
    qualitativeValue: string | null;
    uncertainty: string | null;
  }>;
};

@Injectable()
export class ParseLabDocumentUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: {
    buffer: Buffer;
    fileName: string;
    mimeType?: string;
  }): Promise<ParsedDocumentResponse> {
    try {
      const parsed = await parseLabDocument(input);
      const siteName = settlementHintFromReport(
        parsed.report.locationDetail,
        parsed.report.villageName,
      );
      const matched = await this.resolveLocation({
        tehsilName: parsed.report.tehsilName,
        villageName: parsed.report.villageName,
        locationDetail: parsed.report.locationDetail,
        settlementHint: siteName,
      });
      const source = await this.resolveSource(
        parsed.report.sourceLabel,
        parsed.report.sampleType,
      );
      const warnings = [...parsed.report.warnings, ...matched.warnings];
      if (!matched.tehsilId) {
        warnings.push(
          'Location text could not be matched to tehsil / village. Select it manually.',
        );
      } else if (!matched.villageId) {
        warnings.push(
          'Tehsil was matched but village could not be linked. Select village manually.',
        );
      }
      if (source.unmatched && parsed.report.sourceLabel) {
        warnings.push(
          `Source "${parsed.report.sourceLabel}" is not in the catalog yet. Mapped to Other until a source type is added.`,
        );
      }

      return {
        sourceFileName: input.fileName,
        confidence: parsed.report.confidence,
        warnings,
        formType: parsed.report.formType,
        sampleType: source.category,
        reportCategory: parsed.report.reportCategory,
        fields: {
          reportSerialNo: parsed.report.reportSerialNo,
          nwqlSampleCode: parsed.report.nwqlSampleCode,
          customerCode: parsed.report.customerCode,
          customerName: parsed.report.customerName,
          customerAddress: parsed.report.customerAddress,
          customerPhone: parsed.report.customerPhone,
          locationDetail: parsed.report.locationDetail,
          workOrder: parsed.report.workOrder,
          sourceLabel: parsed.report.sourceLabel,
          documentTehsilName: parsed.report.tehsilName,
          documentVillageName: parsed.report.villageName,
          siteName,
          totalPages: parsed.report.totalPages,
          samplingAt: parsed.report.samplingAt,
          receivedAt: parsed.report.receivedAt,
          receiptTempC: parsed.report.receiptTempC,
          receiptHumidityPct: parsed.report.receiptHumidityPct,
          analysisFrom: parsed.report.analysisFrom,
          analysisTo: parsed.report.analysisTo,
          reportingDate: parsed.report.reportingDate,
          remarksOverride: parsed.report.remarksOverride,
        },
        location: {
          tehsilId: matched.tehsilId,
          tehsilName: matched.tehsilName,
          villageId: matched.villageId,
          villageName: matched.villageName,
          settlementId: matched.settlementId,
          settlementName: matched.settlementName,
          siteName: matched.siteName ?? siteName,
          score: matched.score,
          linked: matched.linked,
        },
        source: {
          sourceTypeId: source.sourceTypeId,
          code: source.code,
          name: source.name,
          category: source.category,
          sourceLabel: parsed.report.sourceLabel,
          matched: !source.unmatched,
        },
        results: parsed.report.results,
      };
    } catch (error) {
      if (error instanceof LabDocumentExtractionError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async resolveSource(
    sourceLabel: string | null,
    inferredCategory: 'SOURCE_WELL' | 'POU_TAP' | 'OHR',
  ) {
    const catalog = await this.prisma.sourceType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const matched = matchSourceType(sourceLabel, catalog);
    if (!matched.unmatched && matched.sourceType) {
      return {
        sourceTypeId: matched.sourceType.id,
        code: matched.sourceType.code,
        name: matched.sourceType.name,
        category: matched.sourceType.category,
        unmatched: false,
      };
    }

    const fallbackCode = DEFAULT_SOURCE_TYPE_BY_CATEGORY[inferredCategory];
    const inferredFallback =
      catalog.find((item) => item.code === fallbackCode) ??
      catalog.find((item) => item.category === inferredCategory) ??
      null;
    const other = catalog.find((item) => item.code === 'OTHER') ?? null;
    const sourceType = sourceLabel?.trim()
      ? (other ?? inferredFallback)
      : (inferredFallback ?? other);

    return {
      sourceTypeId: sourceType?.id ?? null,
      code: sourceType?.code ?? null,
      name: sourceType?.name ?? null,
      category: sourceType?.category ?? inferredCategory,
      unmatched: Boolean(sourceLabel?.trim()),
    };
  }

  private async resolveLocation(input: {
    tehsilName: string | null;
    villageName: string | null;
    locationDetail: string | null;
    settlementHint: string | null;
  }) {
    const tehsils = await this.prisma.tehsil.findMany({
      include: {
        villages: {
          include: { settlements: true },
        },
      },
    });

    return matchLocationHierarchy(
      {
        tehsilName: input.tehsilName,
        villageName: input.villageName,
        locationDetail: input.locationDetail,
        settlementHint: input.settlementHint,
      },
      tehsils.map((tehsil) => ({
        id: tehsil.id,
        name: tehsil.name,
        villages: tehsil.villages.map((village) => ({
          id: village.id,
          name: village.name,
          settlements: village.settlements.map((settlement) => ({
            id: settlement.id,
            name: settlement.name,
          })),
        })),
      })),
    );
  }
}
