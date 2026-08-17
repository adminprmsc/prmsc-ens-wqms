import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole } from '../../domain/user/user';
import {
  judgeReportResults,
  toJudgmentRules,
  validateReceiptMeta,
  WaterQualityValidationError,
  type RawParameterResultInput,
} from '../../domain/water-quality';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';

export type ReportActor = {
  id: string;
  role: UserRole;
};

export type CreateWaterQualityReportCommand = {
  reportSerialNo: string;
  nwqlSampleCode?: string | null;
  customerCode?: string | null;
  customerName: string;
  customerAddress?: string | null;
  customerPhone?: string | null;
  tehsilId: string;
  villageId: string;
  settlementId?: string | null;
  sourceTypeId?: string | null;
  sampleType?: 'SOURCE_WELL' | 'POU_TAP' | 'OHR';
  sourceLabel?: string | null;
  documentTehsilName?: string | null;
  documentVillageName?: string | null;
  siteName?: string | null;
  reportCategory?: 'PCRWR' | 'BASELINE';
  formType?: 'PRIORITY' | 'FULL';
  workOrder?: string | null;
  locationDetail: string;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  samplingAt: Date;
  receivedAt?: Date | null;
  receiptTempC?: number | null;
  receiptHumidityPct?: number | null;
  analysisFrom?: Date | null;
  analysisTo?: Date | null;
  reportingDate: Date;
  totalPages?: number | null;
  termsAgreed?: boolean;
  remarksOverride?: string | null;
  results: RawParameterResultInput[];
  requireAllParameters?: boolean;
  createdById: string;
};

function decimalToNumber(
  value: Prisma.Decimal | number | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'number' ? value : Number(value);
}

@Injectable()
export class WaterQualityReportsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async listParameters(formType?: 'PRIORITY' | 'FULL') {
    return this.prisma.waterQualityParameter.findMany({
      where: {
        isActive: true,
        ...(formType === 'PRIORITY' ? { includedInPriority: true } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async listSourceTypes() {
    return this.prisma.sourceType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async listReports(
    actor: ReportActor,
    filter?: {
      tehsilId?: string;
      villageId?: string;
      settlementId?: string;
      status?:
        'DRAFT' | 'SUBMITTED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
      sampleType?: 'SOURCE_WELL' | 'POU_TAP' | 'OHR';
      sourceTypeId?: string;
      reportCategory?: 'PCRWR' | 'BASELINE';
      formType?: 'PRIORITY' | 'FULL';
      chemicalConformity?: 'SAFE' | 'UNSAFE';
      microbialConformity?: 'SAFE' | 'UNSAFE';
    },
  ) {
    return this.prisma.waterQualityReport.findMany({
      where: {
        ...this.visibilityWhere(actor),
        tehsilId: filter?.tehsilId,
        villageId: filter?.villageId,
        settlementId: filter?.settlementId,
        status: filter?.status,
        sampleType: filter?.sampleType,
        sourceTypeId: filter?.sourceTypeId,
        reportCategory: filter?.reportCategory,
        formType: filter?.formType,
        chemicalConformity: filter?.chemicalConformity,
        microbialConformity: filter?.microbialConformity,
      },
      include: {
        tehsil: { select: { id: true, name: true } },
        village: { select: { id: true, name: true } },
        settlement: { select: { id: true, name: true } },
        sourceType: {
          select: { id: true, code: true, name: true, category: true },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { results: true } },
      },
      orderBy: { reportingDate: 'desc' },
    });
  }

  async getReport(id: string, actor: ReportActor) {
    const report = await this.prisma.waterQualityReport.findUnique({
      where: { id },
      include: {
        tehsil: true,
        village: true,
        settlement: true,
        sourceType: true,
        createdBy: { select: { id: true, name: true, email: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
        results: {
          include: { parameter: true },
          orderBy: { parameter: { sortOrder: 'asc' } },
        },
      },
    });
    if (!report) {
      throw new NotFoundException('Water quality report not found');
    }
    this.assertCanView(actor, report);
    return report;
  }

  async validateOnly(command: CreateWaterQualityReportCommand) {
    await this.resolveSourceType(command);
    await this.assertLocationHierarchy(command);
    const metaErrors = validateReceiptMeta({
      receiptTempC: command.receiptTempC,
      receiptHumidityPct: command.receiptHumidityPct,
      samplingAt: command.samplingAt,
      receivedAt: command.receivedAt,
      analysisFrom: command.analysisFrom,
      analysisTo: command.analysisTo,
      reportingDate: command.reportingDate,
      gpsLatitude: command.gpsLatitude,
      gpsLongitude: command.gpsLongitude,
    });
    if (metaErrors.length > 0) {
      throw new BadRequestException({
        message: 'Invalid report metadata',
        errors: metaErrors,
      });
    }

    const formType = command.formType ?? 'PRIORITY';
    const parameters = await this.prisma.waterQualityParameter.findMany({
      where: {
        isActive: true,
        ...(formType === 'PRIORITY' ? { includedInPriority: true } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });

    const requireAll =
      command.requireAllParameters === true || formType === 'PRIORITY';

    try {
      return judgeReportResults(
        toJudgmentRules(
          parameters.map((parameter) => ({
            code: parameter.code,
            name: parameter.name,
            conformityGroup: parameter.conformityGroup,
            limitOperator: parameter.limitOperator,
            limitMin: decimalToNumber(parameter.limitMin),
            limitMax: decimalToNumber(parameter.limitMax),
            limitDisplay: parameter.limitDisplay,
            qualitativeAllowed: parameter.qualitativeAllowed,
            detectionLimit: decimalToNumber(parameter.detectionLimit),
          })),
        ),
        command.results,
        { requireAllParameters: requireAll },
      );
    } catch (error) {
      this.rethrowValidation(error);
    }
  }

  async create(command: CreateWaterQualityReportCommand) {
    const judgment = await this.validateOnly(command);
    await this.assertUniqueIdentifiers(command);

    const parameters = await this.prisma.waterQualityParameter.findMany({
      where: { isActive: true },
    });
    const parameterByCode = new Map(
      parameters.map((parameter) => [parameter.code, parameter]),
    );
    const sourceType = await this.resolveSourceType(command);
    const overallRemarks =
      command.remarksOverride?.trim() || judgment.conformity.overallRemarks;

    try {
      const created = await this.prisma.waterQualityReport.create({
        data: {
          reportSerialNo: command.reportSerialNo.trim(),
          nwqlSampleCode: command.nwqlSampleCode?.trim() || null,
          customerCode: command.customerCode?.trim() || null,
          customerName: command.customerName.trim(),
          customerAddress: command.customerAddress?.trim() || null,
          customerPhone: command.customerPhone?.trim() || null,
          tehsilId: command.tehsilId,
          villageId: command.villageId,
          settlementId: command.settlementId || null,
          sourceTypeId: sourceType.id,
          sampleType: sourceType.category,
          sourceLabel: command.sourceLabel?.trim() || null,
          documentTehsilName: command.documentTehsilName?.trim() || null,
          documentVillageName: command.documentVillageName?.trim() || null,
          siteName: command.siteName?.trim() || null,
          reportCategory: command.reportCategory ?? 'PCRWR',
          formType: command.formType ?? 'PRIORITY',
          workOrder: command.workOrder?.trim() || null,
          locationDetail: command.locationDetail.trim(),
          gpsLatitude: command.gpsLatitude ?? null,
          gpsLongitude: command.gpsLongitude ?? null,
          samplingAt: command.samplingAt,
          receivedAt: command.receivedAt ?? null,
          receiptTempC: command.receiptTempC ?? null,
          receiptHumidityPct: command.receiptHumidityPct ?? null,
          analysisFrom: command.analysisFrom ?? null,
          analysisTo: command.analysisTo ?? null,
          reportingDate: command.reportingDate,
          totalPages: command.totalPages ?? null,
          physicalConformity: judgment.conformity.physicalConformity,
          chemicalConformity: judgment.conformity.chemicalConformity,
          traceConformity: judgment.conformity.traceConformity,
          microbialConformity: judgment.conformity.microbialConformity,
          overallRemarks,
          termsAgreed: command.termsAgreed === true,
          status: 'DRAFT',
          createdById: command.createdById,
          results: {
            create: judgment.results.map((result) => {
              const parameter = parameterByCode.get(result.parameterCode)!;
              return {
                parameterId: parameter.id,
                resultType: result.resultType,
                numericValue: result.numericValue,
                qualitativeValue: result.qualitativeValue,
                uncertainty: result.uncertainty,
                exceedsLimit: result.exceedsLimit,
                isJudged: result.isJudged,
                limitDisplaySnap: result.limitDisplay,
              };
            }),
          },
        },
        include: this.detailInclude(),
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'REPORT_CREATED',
          actorId: command.createdById,
          metadata: {
            reportId: created.id,
            reportSerialNo: created.reportSerialNo,
          },
        },
      });

      return {
        report: created,
        judgment: judgment.conformity,
        exceededDetails: judgment.results.filter(
          (result) => result.exceedsLimit,
        ),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Duplicate report serial or sample code');
      }
      throw error;
    }
  }

  async update(
    id: string,
    command: CreateWaterQualityReportCommand,
    actor: ReportActor,
  ) {
    const existing = await this.prisma.waterQualityReport.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Water quality report not found');
    }
    this.assertCanEdit(actor, existing);

    const judgment = await this.validateOnly(command);
    await this.assertUniqueIdentifiers(command, id);

    const parameters = await this.prisma.waterQualityParameter.findMany({
      where: { isActive: true },
    });
    const parameterByCode = new Map(
      parameters.map((parameter) => [parameter.code, parameter]),
    );
    const sourceType = await this.resolveSourceType(command);
    const overallRemarks =
      command.remarksOverride?.trim() || judgment.conformity.overallRemarks;

    try {
      const updated = await this.prisma.waterQualityReport.update({
        where: { id },
        data: {
          reportSerialNo: command.reportSerialNo.trim(),
          nwqlSampleCode: command.nwqlSampleCode?.trim() || null,
          customerCode: command.customerCode?.trim() || null,
          customerName: command.customerName.trim(),
          customerAddress: command.customerAddress?.trim() || null,
          customerPhone: command.customerPhone?.trim() || null,
          tehsilId: command.tehsilId,
          villageId: command.villageId,
          settlementId: command.settlementId || null,
          sourceTypeId: sourceType.id,
          sampleType: sourceType.category,
          sourceLabel: command.sourceLabel?.trim() || null,
          documentTehsilName: command.documentTehsilName?.trim() || null,
          documentVillageName: command.documentVillageName?.trim() || null,
          siteName: command.siteName?.trim() || null,
          reportCategory: command.reportCategory ?? existing.reportCategory,
          formType: command.formType ?? existing.formType,
          workOrder: command.workOrder?.trim() || null,
          locationDetail: command.locationDetail.trim(),
          gpsLatitude: command.gpsLatitude ?? null,
          gpsLongitude: command.gpsLongitude ?? null,
          samplingAt: command.samplingAt,
          receivedAt: command.receivedAt ?? null,
          receiptTempC: command.receiptTempC ?? null,
          receiptHumidityPct: command.receiptHumidityPct ?? null,
          analysisFrom: command.analysisFrom ?? null,
          analysisTo: command.analysisTo ?? null,
          reportingDate: command.reportingDate,
          totalPages: command.totalPages ?? null,
          physicalConformity: judgment.conformity.physicalConformity,
          chemicalConformity: judgment.conformity.chemicalConformity,
          traceConformity: judgment.conformity.traceConformity,
          microbialConformity: judgment.conformity.microbialConformity,
          overallRemarks,
          termsAgreed: command.termsAgreed === true,
          results: {
            deleteMany: {},
            create: judgment.results.map((result) => {
              const parameter = parameterByCode.get(result.parameterCode)!;
              return {
                parameterId: parameter.id,
                resultType: result.resultType,
                numericValue: result.numericValue,
                qualitativeValue: result.qualitativeValue,
                uncertainty: result.uncertainty,
                exceedsLimit: result.exceedsLimit,
                isJudged: result.isJudged,
                limitDisplaySnap: result.limitDisplay,
              };
            }),
          },
        },
        include: this.detailInclude(),
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'REPORT_UPDATED',
          actorId: actor.id,
          metadata: {
            reportId: updated.id,
            reportSerialNo: updated.reportSerialNo,
          },
        },
      });

      return {
        report: updated,
        judgment: judgment.conformity,
        exceededDetails: judgment.results.filter(
          (result) => result.exceedsLimit,
        ),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Duplicate report serial or sample code');
      }
      throw error;
    }
  }

  async submit(id: string, actor: ReportActor) {
    const report = await this.prisma.waterQualityReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException('Water quality report not found');
    }
    if (
      report.createdById !== actor.id &&
      actor.role !== UserRole.SYSTEM_ADMIN
    ) {
      throw new ForbiddenException('You can only submit your own reports');
    }
    if (report.status !== 'DRAFT' && report.status !== 'REJECTED') {
      throw new BadRequestException(
        'Only draft or rejected reports can be submitted for review',
      );
    }
    if (!report.termsAgreed) {
      throw new BadRequestException('Terms must be agreed before submission');
    }

    const updated = await this.prisma.waterQualityReport.update({
      where: { id },
      data: {
        status: 'PENDING_REVIEW',
        submittedById: actor.id,
        submittedAt: new Date(),
        rejectionReason: null,
      },
      include: this.detailInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'REPORT_SUBMITTED',
        actorId: actor.id,
        metadata: { reportId: id },
      },
    });

    return updated;
  }

  async approve(id: string, actor: ReportActor) {
    this.assertReviewer(actor);
    const report = await this.prisma.waterQualityReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException('Water quality report not found');
    }
    if (report.status !== 'PENDING_REVIEW' && report.status !== 'SUBMITTED') {
      throw new BadRequestException('Only submitted reports can be approved');
    }

    const updated = await this.prisma.waterQualityReport.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: actor.id,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
      include: this.detailInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'REPORT_APPROVED',
        actorId: actor.id,
        metadata: { reportId: id },
      },
    });

    return updated;
  }

  async reject(id: string, actor: ReportActor, reason: string) {
    this.assertReviewer(actor);
    const report = await this.prisma.waterQualityReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException('Water quality report not found');
    }
    if (report.status !== 'PENDING_REVIEW' && report.status !== 'SUBMITTED') {
      throw new BadRequestException('Only submitted reports can be rejected');
    }

    const updated = await this.prisma.waterQualityReport.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: actor.id,
        reviewedAt: new Date(),
        rejectionReason: reason.trim(),
      },
      include: this.detailInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'REPORT_REJECTED',
        actorId: actor.id,
        metadata: { reportId: id, reason: reason.trim() },
      },
    });

    return updated;
  }

  private visibilityWhere(
    actor: ReportActor,
  ): Prisma.WaterQualityReportWhereInput {
    if (actor.role === UserRole.SYSTEM_ADMIN) {
      return {};
    }
    if (actor.role === UserRole.SUPER_ADMIN) {
      return {
        status: { in: ['PENDING_REVIEW', 'SUBMITTED', 'APPROVED', 'REJECTED'] },
      };
    }
    return {
      OR: [{ createdById: actor.id }, { status: 'APPROVED' }],
    };
  }

  private assertCanView(
    actor: ReportActor,
    report: { createdById: string | null; status: string },
  ) {
    if (actor.role === UserRole.SYSTEM_ADMIN) return;
    if (actor.role === UserRole.SUPER_ADMIN) {
      if (report.status === 'DRAFT') {
        throw new ForbiddenException(
          'Draft reports are not visible to reviewers',
        );
      }
      return;
    }
    if (report.createdById === actor.id || report.status === 'APPROVED') {
      return;
    }
    throw new ForbiddenException('You cannot view this report');
  }

  private assertReviewer(actor: ReportActor) {
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.SYSTEM_ADMIN
    ) {
      throw new ForbiddenException('Only PRMSC managers can review reports');
    }
  }

  private detailInclude() {
    return {
      tehsil: { select: { id: true, name: true } },
      village: { select: { id: true, name: true } },
      settlement: { select: { id: true, name: true } },
      sourceType: {
        select: { id: true, code: true, name: true, category: true },
      },
      createdBy: { select: { id: true, name: true, email: true } },
      results: {
        include: { parameter: true },
        orderBy: { parameter: { sortOrder: 'asc' } },
      },
    } as const;
  }

  private async resolveSourceType(
    command: Pick<
      CreateWaterQualityReportCommand,
      'sourceTypeId' | 'sampleType'
    >,
  ) {
    if (command.sourceTypeId) {
      const sourceType = await this.prisma.sourceType.findUnique({
        where: { id: command.sourceTypeId },
      });
      if (!sourceType || !sourceType.isActive) {
        throw new BadRequestException(
          'sourceTypeId is not a valid source type',
        );
      }
      return sourceType;
    }

    if (command.sampleType) {
      const preferredCode =
        command.sampleType === 'POU_TAP'
          ? 'TAP_WATER'
          : command.sampleType === 'OHR'
            ? 'OHR'
            : 'SOURCE_WELL';
      const byCode = await this.prisma.sourceType.findUnique({
        where: { code: preferredCode },
      });
      if (byCode?.isActive) return byCode;
      const byCategory = await this.prisma.sourceType.findFirst({
        where: { category: command.sampleType, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      if (byCategory) return byCategory;
    }

    throw new BadRequestException('Select a source type');
  }

  private assertCanEdit(
    actor: ReportActor,
    report: { createdById: string | null; status: string },
  ) {
    if (report.status !== 'DRAFT' && report.status !== 'REJECTED') {
      throw new BadRequestException(
        'Only draft or rejected reports can be edited',
      );
    }
    if (
      report.createdById !== actor.id &&
      actor.role !== UserRole.SYSTEM_ADMIN
    ) {
      throw new ForbiddenException('You can only edit your own reports');
    }
  }

  private async assertUniqueIdentifiers(
    command: Pick<
      CreateWaterQualityReportCommand,
      'reportSerialNo' | 'nwqlSampleCode'
    >,
    excludeReportId?: string,
  ) {
    if (command.nwqlSampleCode) {
      const existingSample = await this.prisma.waterQualityReport.findUnique({
        where: { nwqlSampleCode: command.nwqlSampleCode.trim() },
      });
      if (existingSample && existingSample.id !== excludeReportId) {
        throw new ConflictException('nwqlSampleCode already exists');
      }
    }
  }

  private async assertLocationHierarchy(
    command: Pick<
      CreateWaterQualityReportCommand,
      'tehsilId' | 'villageId' | 'settlementId'
    >,
  ) {
    const village = await this.prisma.village.findUnique({
      where: { id: command.villageId },
      include: { tehsil: true },
    });
    if (!village) {
      throw new BadRequestException('villageId does not exist');
    }
    const tehsil = await this.prisma.tehsil.findUnique({
      where: { id: command.tehsilId },
    });
    if (!tehsil) {
      throw new BadRequestException('tehsilId does not exist');
    }
    if (village.tehsilId !== command.tehsilId) {
      throw new BadRequestException(
        'Village does not belong to the selected tehsil',
      );
    }
    if (command.settlementId) {
      const settlement = await this.prisma.settlement.findUnique({
        where: { id: command.settlementId },
      });
      if (!settlement) {
        throw new BadRequestException('settlementId does not exist');
      }
      if (settlement.villageId !== command.villageId) {
        throw new BadRequestException(
          'Settlement does not belong to the selected village',
        );
      }
    }
  }

  private rethrowValidation(error: unknown): never {
    if (error instanceof WaterQualityValidationError) {
      throw new BadRequestException({
        message: error.message,
        errors: error.details.length > 0 ? error.details : [error.message],
      });
    }
    throw error;
  }
}
