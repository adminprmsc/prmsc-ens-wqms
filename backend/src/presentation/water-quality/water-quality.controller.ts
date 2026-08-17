import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ParseLabDocumentUseCase } from '../../application/water-quality/parse-lab-document.use-case';
import { WaterQualityReportsUseCase } from '../../application/water-quality/water-quality-reports.use-case';
import { UserRole } from '../../domain/user/user';
import { CurrentUser, Roles, type AuthUser } from '../auth/auth.decorators';
import {
  CreateWaterQualityReportDto,
  RejectReportDto,
  ValidateWaterQualityReportDto,
} from './dto/water-quality-report.dto';

@Controller('water-quality')
@Roles(UserRole.SYSTEM_ADMIN, UserRole.SUPER_ADMIN, UserRole.USER)
export class WaterQualityController {
  constructor(
    private readonly reports: WaterQualityReportsUseCase,
    private readonly parseDocument: ParseLabDocumentUseCase,
  ) {}

  @Get('parameters')
  listParameters(@Query('formType') formType?: 'PRIORITY' | 'FULL') {
    return this.reports.listParameters(formType);
  }

  @Get('source-types')
  listSourceTypes() {
    return this.reports.listSourceTypes();
  }

  @Get('reports')
  listReports(
    @CurrentUser() user: AuthUser,
    @Query('tehsilId') tehsilId?: string,
    @Query('villageId') villageId?: string,
    @Query('settlementId') settlementId?: string,
    @Query('status')
    status?: 'DRAFT' | 'SUBMITTED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED',
    @Query('sampleType') sampleType?: 'SOURCE_WELL' | 'POU_TAP' | 'OHR',
    @Query('sourceTypeId') sourceTypeId?: string,
    @Query('reportCategory') reportCategory?: 'PCRWR' | 'BASELINE',
    @Query('formType') formType?: 'PRIORITY' | 'FULL',
    @Query('chemicalConformity') chemicalConformity?: 'SAFE' | 'UNSAFE',
    @Query('microbialConformity') microbialConformity?: 'SAFE' | 'UNSAFE',
  ) {
    return this.reports.listReports(
      { id: user.id, role: user.role },
      {
        tehsilId,
        villageId,
        settlementId,
        status,
        sampleType,
        sourceTypeId,
        reportCategory,
        formType,
        chemicalConformity,
        microbialConformity,
      },
    );
  }

  @Get('reports/:id')
  getReport(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reports.getReport(id, { id: user.id, role: user.role });
  }

  @Post('reports/parse')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }),
  )
  parse(
    @UploadedFile()
    file?: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
    },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Upload a PCRWR NWQL .docx or .pdf file');
    }
    return this.parseDocument.execute({
      buffer: file.buffer,
      fileName: file.originalname || 'report.docx',
      mimeType: file.mimetype,
    });
  }

  @Post('reports/validate')
  validate(
    @Body() body: ValidateWaterQualityReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.validateOnly(this.toCommand(body, user.id));
  }

  @Post('reports')
  create(
    @Body() body: CreateWaterQualityReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.create(this.toCommand(body, user.id));
  }

  @Patch('reports/:id')
  update(
    @Param('id') id: string,
    @Body() body: CreateWaterQualityReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.update(id, this.toCommand(body, user.id), {
      id: user.id,
      role: user.role,
    });
  }

  @Post('reports/:id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reports.submit(id, { id: user.id, role: user.role });
  }

  @Post('reports/:id/approve')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SUPER_ADMIN)
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reports.approve(id, { id: user.id, role: user.role });
  }

  @Post('reports/:id/reject')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SUPER_ADMIN)
  reject(
    @Param('id') id: string,
    @Body() body: RejectReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.reject(
      id,
      { id: user.id, role: user.role },
      body.reason,
    );
  }

  private toCommand(body: CreateWaterQualityReportDto, createdById: string) {
    return {
      reportSerialNo: body.reportSerialNo,
      nwqlSampleCode: body.nwqlSampleCode,
      customerCode: body.customerCode,
      customerName: body.customerName,
      customerAddress: body.customerAddress,
      customerPhone: body.customerPhone,
      tehsilId: body.tehsilId,
      villageId: body.villageId,
      settlementId: body.settlementId,
      sourceTypeId: body.sourceTypeId,
      sampleType: body.sampleType,
      sourceLabel: body.sourceLabel,
      documentTehsilName: body.documentTehsilName,
      documentVillageName: body.documentVillageName,
      siteName: body.siteName,
      reportCategory: body.reportCategory,
      formType: body.formType,
      workOrder: body.workOrder,
      locationDetail: body.locationDetail,
      gpsLatitude: body.gpsLatitude,
      gpsLongitude: body.gpsLongitude,
      samplingAt: new Date(body.samplingAt),
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : null,
      receiptTempC: body.receiptTempC,
      receiptHumidityPct: body.receiptHumidityPct,
      analysisFrom: body.analysisFrom ? new Date(body.analysisFrom) : null,
      analysisTo: body.analysisTo ? new Date(body.analysisTo) : null,
      reportingDate: new Date(body.reportingDate),
      totalPages: body.totalPages,
      termsAgreed: body.termsAgreed,
      remarksOverride: body.remarksOverride,
      requireAllParameters: body.requireAllParameters,
      createdById,
      results: body.results.map((result) => ({
        parameterCode: result.parameterCode,
        resultType: result.resultType,
        numericValue: result.numericValue,
        qualitativeValue: result.qualitativeValue,
        uncertainty: result.uncertainty,
      })),
    };
  }
}
