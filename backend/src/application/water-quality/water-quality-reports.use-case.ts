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
} from '../../domain/water-quality';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import { LabDocumentStorageService } from '../../infrastructure/storage/lab-document-storage.service';
import type {
  CreateWaterQualityReportCommand,
  ReportActor,
  SourceDocumentFile,
} from './report-commands';

export type {
  CreateWaterQualityReportCommand,
  ReportActor,
  SourceDocumentFile,
} from './report-commands';

function decimalToNumber(
  value: Prisma.Decimal | number | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'number' ? value : Number(value);
}

function csvCell(value: string | number | boolean | null | undefined) {
  let text = '';
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number' || typeof value === 'boolean') {
    text = value.toString();
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function unsafeRate(unsafe: number, reports: number) {
  if (reports <= 0) return 0;
  return Math.round((unsafe / reports) * 100);
}

function riskBand(input: {
  reports: number;
  unsafe: number;
  unsafeMicrobial: number;
}) {
  if (input.reports === 0) return 'NONE' as const;
  if (input.unsafeMicrobial > 0) return 'CRITICAL' as const;
  if (input.unsafe / input.reports >= 0.5) return 'HIGH' as const;
  if (input.unsafe > 0) return 'WATCH' as const;
  return 'STABLE' as const;
}

type ReportListFilter = {
  tehsilId?: string;
  villageId?: string;
  settlementId?: string;
  serial?: string;
  status?: 'DRAFT' | 'SUBMITTED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  sampleType?: 'SOURCE_WELL' | 'POU_TAP' | 'OHR';
  sourceTypeId?: string;
  reportCategory?: 'PCRWR' | 'BASELINE';
  formType?: 'PRIORITY' | 'FULL';
  chemicalConformity?: 'SAFE' | 'UNSAFE';
  microbialConformity?: 'SAFE' | 'UNSAFE';
  page?: number;
  pageSize?: number;
};

@Injectable()
export class WaterQualityReportsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LabDocumentStorageService,
  ) {}

  async listParameters(formType?: 'PRIORITY' | 'FULL') {
    return await this.prisma.waterQualityParameter.findMany({
      where: {
        isActive: true,
        ...(formType === 'PRIORITY' ? { includedInPriority: true } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async listSourceTypes() {
    return await this.prisma.sourceType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async listReports(actor: ReportActor, filter?: ReportListFilter) {
    const rawPage = filter?.page ?? 1;
    const rawSize = filter?.pageSize ?? 20;
    const page =
      Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const pageSize =
      Number.isFinite(rawSize) && rawSize > 0
        ? Math.min(100, Math.floor(rawSize))
        : 20;
    const where = this.listWhere(actor, filter);

    const [items, total] = await Promise.all([
      this.prisma.waterQualityReport.findMany({
        where,
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
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.waterQualityReport.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toPublicReport(item)),
      total,
      page,
      pageSize,
    };
  }

  async analytics(
    actor: ReportActor,
    filter?: {
      tehsilId?: string;
      villageId?: string;
      settlementId?: string;
    },
  ) {
    this.assertReviewer(actor);
    const visible = {
      ...this.visibilityWhere(actor),
      tehsilId: filter?.tehsilId,
      villageId: filter?.villageId,
      settlementId: filter?.settlementId,
    };

    const [statusGroups, approved, tehsilCount] = await Promise.all([
      this.prisma.waterQualityReport.groupBy({
        by: ['status'],
        where: visible,
        _count: { _all: true },
      }),
      this.prisma.waterQualityReport.findMany({
        where: { ...visible, status: 'APPROVED' },
        select: {
          id: true,
          reportSerialNo: true,
          reportingDate: true,
          physicalConformity: true,
          chemicalConformity: true,
          traceConformity: true,
          microbialConformity: true,
          sampleType: true,
          tehsil: { select: { id: true, name: true } },
          village: { select: { id: true, name: true } },
          settlement: { select: { id: true, name: true } },
          sourceType: { select: { id: true, name: true } },
        },
        orderBy: { reportingDate: 'desc' },
      }),
      this.prisma.tehsil.count(),
    ]);

    const statusCount = (status: string) =>
      statusGroups.find((row) => row.status === status)?._count._all ?? 0;

    const isUnsafe = (row: (typeof approved)[number]) =>
      row.physicalConformity === 'UNSAFE' ||
      row.chemicalConformity === 'UNSAFE' ||
      row.traceConformity === 'UNSAFE' ||
      row.microbialConformity === 'UNSAFE';

    const byTehsilMap = new Map<
      string,
      {
        tehsilId: string;
        tehsilName: string;
        reports: number;
        unsafe: number;
        unsafeMicrobial: number;
        unsafeChemical: number;
        unsafePhysical: number;
      }
    >();
    const byVillageMap = new Map<
      string,
      {
        villageId: string;
        villageName: string;
        tehsilId: string;
        tehsilName: string;
        reports: number;
        unsafe: number;
        unsafeMicrobial: number;
        unsafeChemical: number;
        unsafePhysical: number;
      }
    >();
    const bySourceMap = new Map<
      string,
      { name: string; reports: number; unsafe: number }
    >();
    const byMonthMap = new Map<
      string,
      { period: string; approved: number; unsafe: number }
    >();

    for (const row of approved) {
      const unsafe = isUnsafe(row);
      const tehsil = byTehsilMap.get(row.tehsil.id) ?? {
        tehsilId: row.tehsil.id,
        tehsilName: row.tehsil.name,
        reports: 0,
        unsafe: 0,
        unsafeMicrobial: 0,
        unsafeChemical: 0,
        unsafePhysical: 0,
      };
      tehsil.reports += 1;
      if (unsafe) tehsil.unsafe += 1;
      if (row.microbialConformity === 'UNSAFE') tehsil.unsafeMicrobial += 1;
      if (row.chemicalConformity === 'UNSAFE') tehsil.unsafeChemical += 1;
      if (row.physicalConformity === 'UNSAFE') tehsil.unsafePhysical += 1;
      byTehsilMap.set(row.tehsil.id, tehsil);

      const village = byVillageMap.get(row.village.id) ?? {
        villageId: row.village.id,
        villageName: row.village.name,
        tehsilId: row.tehsil.id,
        tehsilName: row.tehsil.name,
        reports: 0,
        unsafe: 0,
        unsafeMicrobial: 0,
        unsafeChemical: 0,
        unsafePhysical: 0,
      };
      village.reports += 1;
      if (unsafe) village.unsafe += 1;
      if (row.microbialConformity === 'UNSAFE') village.unsafeMicrobial += 1;
      if (row.chemicalConformity === 'UNSAFE') village.unsafeChemical += 1;
      if (row.physicalConformity === 'UNSAFE') village.unsafePhysical += 1;
      byVillageMap.set(row.village.id, village);

      const sourceName = row.sourceType?.name ?? row.sampleType;
      const source = bySourceMap.get(sourceName) ?? {
        name: sourceName,
        reports: 0,
        unsafe: 0,
      };
      source.reports += 1;
      if (unsafe) source.unsafe += 1;
      bySourceMap.set(sourceName, source);

      const period = row.reportingDate.toISOString().slice(0, 7);
      const month = byMonthMap.get(period) ?? {
        period,
        approved: 0,
        unsafe: 0,
      };
      month.approved += 1;
      if (unsafe) month.unsafe += 1;
      byMonthMap.set(period, month);
    }

    const decorate = <
      T extends {
        reports: number;
        unsafe: number;
        unsafeMicrobial: number;
      },
    >(
      row: T,
    ) => ({
      ...row,
      safe: Math.max(0, row.reports - row.unsafe),
      unsafeRate: unsafeRate(row.unsafe, row.reports),
      band: riskBand(row),
    });

    const byTehsil = [...byTehsilMap.values()]
      .map(decorate)
      .sort(
        (left, right) =>
          right.unsafe - left.unsafe || right.reports - left.reports,
      );
    const byVillage = [...byVillageMap.values()]
      .map(decorate)
      .sort(
        (left, right) =>
          right.unsafe - left.unsafe ||
          right.unsafeMicrobial - left.unsafeMicrobial ||
          right.reports - left.reports,
      );

    const unsafeCount = approved.filter(isUnsafe).length;
    const safeCount = approved.length - unsafeCount;
    const unsafePhysical = approved.filter(
      (row) => row.physicalConformity === 'UNSAFE',
    ).length;
    const unsafeChemical = approved.filter(
      (row) => row.chemicalConformity === 'UNSAFE',
    ).length;
    const unsafeTrace = approved.filter(
      (row) => row.traceConformity === 'UNSAFE',
    ).length;
    const unsafeMicrobial = approved.filter(
      (row) => row.microbialConformity === 'UNSAFE',
    ).length;

    let cumulativeApproved = 0;
    let cumulativeUnsafe = 0;
    const byMonth = [...byMonthMap.values()]
      .sort((left, right) => left.period.localeCompare(right.period))
      .map((row) => {
        cumulativeApproved += row.approved;
        cumulativeUnsafe += row.unsafe;
        return {
          ...row,
          safe: Math.max(0, row.approved - row.unsafe),
          cumulativeApproved,
          cumulativeUnsafe,
          cumulativeSafe: Math.max(0, cumulativeApproved - cumulativeUnsafe),
        };
      });

    const criticalVillages = byVillage.filter((row) => row.band === 'CRITICAL');
    const watchVillages = byVillage.filter(
      (row) => row.band === 'HIGH' || row.band === 'WATCH',
    );
    const stance =
      approved.length === 0
        ? ('INSUFFICIENT' as const)
        : unsafeMicrobial > 0
          ? ('CRITICAL' as const)
          : unsafeCount / approved.length >= 0.5
            ? ('HIGH' as const)
            : unsafeCount > 0
              ? ('WATCH' as const)
              : ('STABLE' as const);

    const actions: string[] = [];
    if (approved.length === 0) {
      actions.push(
        'Approve pending laboratory submissions so tehsil and village decisions rest on locked evidence.',
      );
    }
    if (unsafeMicrobial > 0) {
      actions.push(
        `Treat ${criticalVillages.length || unsafeMicrobial} microbial-failure location${criticalVillages.length === 1 ? '' : 's'} as not potable until resampling and disinfection are confirmed.`,
      );
    }
    if (unsafeChemical > 0) {
      actions.push(
        'Review chemical exceedances (fluoride, nitrate, TDS, metals) before recommending household use.',
      );
    }
    if (watchVillages.length > 0 && stance !== 'CRITICAL') {
      actions.push(
        `Keep ${watchVillages.length} village${watchVillages.length === 1 ? '' : 's'} on a watch list and increase sampling frequency.`,
      );
    }
    if (statusCount('PENDING_REVIEW') + statusCount('SUBMITTED') > 0) {
      actions.push(
        `Clear ${statusCount('PENDING_REVIEW') + statusCount('SUBMITTED')} report${statusCount('PENDING_REVIEW') + statusCount('SUBMITTED') === 1 ? '' : 's'} still in the review queue so monitoring stays current.`,
      );
    }
    if (actions.length === 0) {
      actions.push(
        'Approved samples in this filter meet NSDWQ groups. Maintain routine surveillance sampling.',
      );
    }

    const headline =
      stance === 'INSUFFICIENT'
        ? 'Not enough approved evidence to score this place yet.'
        : stance === 'CRITICAL'
          ? 'Microbial failure is present. Do not treat these sources as potable.'
          : stance === 'HIGH'
            ? 'Most approved samples in this filter fail at least one NSDWQ group.'
            : stance === 'WATCH'
              ? 'Some approved samples fail NSDWQ. Target those villages first.'
              : 'Approved samples in this filter are currently potable against NSDWQ groups.';

    return {
      totals: {
        pendingReview: statusCount('PENDING_REVIEW') + statusCount('SUBMITTED'),
        approved: approved.length,
        rejected: statusCount('REJECTED'),
        unsafe: unsafeCount,
        safe: safeCount,
        unsafePhysical,
        unsafeChemical,
        unsafeTrace,
        unsafeMicrobial,
        unsafeRate: unsafeRate(unsafeCount, approved.length),
        tehsilsCovered: byTehsil.length,
        villagesCovered: byVillage.length,
        tehsilsInMaster: tehsilCount,
        coverageRate: unsafeRate(byTehsil.length, tehsilCount),
      },
      brief: {
        stance,
        headline,
        actions,
        coverageNote: filter?.tehsilId
          ? `${byVillage.length} village${byVillage.length === 1 ? '' : 's'} have approved samples in this tehsil.`
          : `${byTehsil.length} of ${tehsilCount} tehsils have at least one approved sample.`,
      },
      hazards: [
        { name: 'Physical', unsafe: unsafePhysical },
        { name: 'Chemical', unsafe: unsafeChemical },
        { name: 'Trace', unsafe: unsafeTrace },
        { name: 'Microbial', unsafe: unsafeMicrobial },
      ],
      byTehsil,
      byVillage,
      bySource: [...bySourceMap.values()]
        .map((row) => ({
          ...row,
          safe: Math.max(0, row.reports - row.unsafe),
          unsafeRate: unsafeRate(row.unsafe, row.reports),
          band: riskBand({ ...row, unsafeMicrobial: 0 }),
        }))
        .sort((left, right) => right.reports - left.reports),
      byMonth,
      alerts: byVillage
        .filter((row) => row.band === 'CRITICAL' || row.band === 'HIGH')
        .slice(0, 8)
        .map((row) => ({
          tehsilId: row.tehsilId,
          villageId: row.villageId,
          tehsilName: row.tehsilName,
          villageName: row.villageName,
          unsafe: row.unsafe,
          unsafeMicrobial: row.unsafeMicrobial,
          reports: row.reports,
          band: row.band,
          message:
            row.band === 'CRITICAL'
              ? `${row.villageName} (${row.tehsilName}) — microbial failure on ${row.unsafeMicrobial} of ${row.reports} approved sample${row.reports === 1 ? '' : 's'}.`
              : `${row.villageName} (${row.tehsilName}) — ${row.unsafeRate}% of approved samples are unsafe.`,
        })),
      recentApproved: approved.slice(0, 8).map((row) => ({
        id: row.id,
        reportSerialNo: row.reportSerialNo,
        reportingDate: row.reportingDate,
        tehsilName: row.tehsil.name,
        villageName: row.village.name,
        unsafe: isUnsafe(row),
        microbialConformity: row.microbialConformity,
        physicalConformity: row.physicalConformity,
        chemicalConformity: row.chemicalConformity,
      })),
    };
  }

  async exportApprovedCsv(
    actor: ReportActor,
    filter?: {
      tehsilId?: string;
      villageId?: string;
      settlementId?: string;
      serial?: string;
      view?: 'samples' | 'summary';
    },
  ) {
    this.assertReviewer(actor);
    if (filter?.view === 'summary') {
      const analytics = await this.analytics(actor, filter);
      const header = [
        'Tehsil',
        'Village',
        'Approved',
        'Safe',
        'Unsafe',
        'Unsafe %',
        'Physical unsafe',
        'Chemical unsafe',
        'Microbial unsafe',
        'Risk band',
      ];
      return [
        header.join(','),
        ...analytics.byVillage.map((row) =>
          [
            row.tehsilName,
            row.villageName,
            row.reports,
            row.safe,
            row.unsafe,
            row.unsafeRate,
            row.unsafePhysical,
            row.unsafeChemical,
            row.unsafeMicrobial,
            row.band,
          ]
            .map(csvCell)
            .join(','),
        ),
      ].join('\n');
    }
    const rows = await this.prisma.waterQualityReport.findMany({
      where: this.listWhere(actor, { ...filter, status: 'APPROVED' }),
      include: {
        tehsil: { select: { name: true } },
        village: { select: { name: true } },
        settlement: { select: { name: true } },
        sourceType: { select: { name: true } },
        createdBy: { select: { name: true, email: true } },
      },
      orderBy: [
        { tehsil: { name: 'asc' } },
        { village: { name: 'asc' } },
        { reportingDate: 'desc' },
      ],
    });

    const header = [
      'Serial',
      'NWQL sample',
      'Tehsil',
      'Village',
      'Settlement',
      'Site',
      'Source',
      'Sampled',
      'Reported',
      'Physical',
      'Chemical',
      'Trace',
      'Microbial',
      'Overall remarks',
      'Analyst',
    ];
    return [
      header.join(','),
      ...rows.map((row) =>
        [
          row.reportSerialNo,
          row.nwqlSampleCode,
          row.tehsil.name,
          row.village.name,
          row.settlement?.name,
          row.siteName,
          row.sourceType?.name ?? row.sampleType,
          row.samplingAt.toISOString().slice(0, 10),
          row.reportingDate.toISOString().slice(0, 10),
          row.physicalConformity,
          row.chemicalConformity,
          row.traceConformity,
          row.microbialConformity,
          row.overallRemarks,
          row.createdBy?.name,
        ]
          .map(csvCell)
          .join(','),
      ),
    ].join('\n');
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
    return this.toPublicReport(report);
  }

  async getSourceDocument(
    id: string,
    actor: ReportActor,
  ): Promise<SourceDocumentFile> {
    const report = await this.prisma.waterQualityReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException('Water quality report not found');
    }
    this.assertCanView(actor, report);
    if (!report.sourceFilePath || !report.sourceFileName) {
      throw new NotFoundException(
        'No original laboratory file is stored for this report',
      );
    }
    if (!this.storage.exists(report.sourceFilePath)) {
      throw new NotFoundException(
        'The original laboratory file is missing from storage',
      );
    }
    return {
      absolutePath: this.storage.absolutePath(report.sourceFilePath),
      fileName: report.sourceFileName,
      mimeType: report.sourceFileMime ?? 'application/octet-stream',
    };
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

    const requireAll = command.requireAllParameters === true;

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

      const report = command.sourceFileToken
        ? await this.attachSourceFile(
            created.id,
            command.sourceFileToken,
            command.createdById,
            null,
          )
        : created;

      return {
        report: this.toPublicReport(report),
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

      const report = command.sourceFileToken
        ? await this.attachSourceFile(
            updated.id,
            command.sourceFileToken,
            actor.id,
            existing.sourceFilePath,
          )
        : updated;

      return {
        report: this.toPublicReport(report),
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

    return this.toPublicReport(updated);
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

    return this.toPublicReport(updated);
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

    return this.toPublicReport(updated);
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

  private listWhere(
    actor: ReportActor,
    filter?: ReportListFilter,
  ): Prisma.WaterQualityReportWhereInput {
    const serial = filter?.serial?.trim();
    return {
      AND: [
        this.visibilityWhere(actor),
        {
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
        serial
          ? {
              OR: [
                {
                  reportSerialNo: { contains: serial, mode: 'insensitive' },
                },
                {
                  nwqlSampleCode: { contains: serial, mode: 'insensitive' },
                },
              ],
            }
          : {},
      ],
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

  private toPublicReport<
    T extends {
      sourceFileName: string | null;
      sourceFileMime: string | null;
      sourceFilePath: string | null;
      sourceFileSize: number | null;
    },
  >(report: T) {
    const {
      sourceFileName,
      sourceFileMime,
      sourceFilePath,
      sourceFileSize,
      ...rest
    } = report;
    return {
      ...rest,
      sourceFile:
        sourceFileName && sourceFilePath
          ? {
              fileName: sourceFileName,
              mimeType: sourceFileMime ?? 'application/octet-stream',
              sizeBytes: sourceFileSize ?? 0,
            }
          : null,
    };
  }

  private async attachSourceFile(
    reportId: string,
    token: string,
    actorId: string,
    previousPath: string | null,
  ) {
    const staging = await this.prisma.labDocumentStaging.findUnique({
      where: { token },
    });
    if (!staging || staging.createdById !== actorId) {
      throw new BadRequestException(
        'Imported laboratory file is no longer available. Upload it again.',
      );
    }
    if (staging.expiresAt.getTime() < Date.now()) {
      await this.storage.deleteIfExists(staging.storagePath);
      await this.prisma.labDocumentStaging.delete({
        where: { id: staging.id },
      });
      throw new BadRequestException(
        'Imported laboratory file expired. Upload it again.',
      );
    }

    const moved = await this.storage.promoteToReport({
      stagingPath: staging.storagePath,
      reportId,
      originalName: staging.originalName,
    });

    await this.prisma.labDocumentStaging.delete({ where: { id: staging.id } });
    if (previousPath && previousPath !== moved.storagePath) {
      await this.storage.deleteIfExists(previousPath);
    }

    return this.prisma.waterQualityReport.update({
      where: { id: reportId },
      data: {
        sourceFileName: staging.originalName,
        sourceFileMime: staging.mimeType,
        sourceFilePath: moved.storagePath,
        sourceFileSize: staging.sizeBytes,
      },
      include: this.detailInclude(),
    });
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
