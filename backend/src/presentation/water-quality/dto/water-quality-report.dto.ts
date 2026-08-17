import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

enum ResultValueTypeDto {
  NUMERIC = 'NUMERIC',
  BDL = 'BDL',
  QUALITATIVE = 'QUALITATIVE',
  NEGATIVE = 'NEGATIVE',
  POSITIVE = 'POSITIVE',
  TNTC = 'TNTC',
}

enum SampleTypeDto {
  SOURCE_WELL = 'SOURCE_WELL',
  POU_TAP = 'POU_TAP',
  OHR = 'OHR',
}

enum ReportCategoryDto {
  PCRWR = 'PCRWR',
  BASELINE = 'BASELINE',
}

enum FormTypeDto {
  PRIORITY = 'PRIORITY',
  FULL = 'FULL',
}

export class WaterQualityResultInputDto {
  @IsString()
  @MinLength(1)
  parameterCode!: string;

  @IsOptional()
  @IsEnum(ResultValueTypeDto)
  resultType?: ResultValueTypeDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  numericValue?: number | null;

  @IsOptional()
  @IsString()
  qualitativeValue?: string | null;

  @IsOptional()
  @IsString()
  uncertainty?: string | null;
}

export class CreateWaterQualityReportDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  reportSerialNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9/\s-]*$/, {
    message: 'nwqlSampleCode must be a lab sample code',
  })
  nwqlSampleCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerCode?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  customerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[0-9+\s()-]*$/, {
    message: 'customerPhone may contain digits and + ( ) - only',
  })
  customerPhone?: string;

  @IsString()
  @MinLength(1)
  tehsilId!: string;

  @IsString()
  @MinLength(1)
  villageId!: string;

  @IsOptional()
  @IsString()
  settlementId?: string;

  @ValidateIf((value: CreateWaterQualityReportDto) => !value.sampleType)
  @IsString()
  @MinLength(1)
  sourceTypeId?: string;

  @ValidateIf((value: CreateWaterQualityReportDto) => !value.sourceTypeId)
  @IsEnum(SampleTypeDto)
  sampleType?: SampleTypeDto;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  documentTehsilName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  documentVillageName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteName?: string;

  @IsOptional()
  @IsEnum(ReportCategoryDto)
  reportCategory?: ReportCategoryDto;

  @IsOptional()
  @IsEnum(FormTypeDto)
  formType?: FormTypeDto;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  workOrder?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  locationDetail!: string;

  @ValidateIf(
    (value: CreateWaterQualityReportDto) => value.gpsLongitude != null,
  )
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  gpsLatitude?: number;

  @ValidateIf((value: CreateWaterQualityReportDto) => value.gpsLatitude != null)
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  gpsLongitude?: number;

  @IsDateString()
  samplingAt!: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-5)
  @Max(50)
  receiptTempC?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  receiptHumidityPct?: number;

  @IsOptional()
  @IsDateString()
  analysisFrom?: string;

  @IsOptional()
  @IsDateString()
  analysisTo?: string;

  @IsDateString()
  reportingDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  totalPages?: number;

  @IsOptional()
  @IsBoolean()
  termsAgreed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarksOverride?: string;

  @IsOptional()
  @IsBoolean()
  requireAllParameters?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{32,64}$/i)
  sourceFileToken?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WaterQualityResultInputDto)
  results!: WaterQualityResultInputDto[];
}

export class ValidateWaterQualityReportDto extends CreateWaterQualityReportDto {}

export class RejectReportDto {
  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;
}
