import type { UserRole } from '../../domain/user/user';
import type { RawParameterResultInput } from '../../domain/water-quality';

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
  sourceFileToken?: string | null;
};

export type SourceDocumentFile = {
  absolutePath: string;
  fileName: string;
  mimeType: string;
};
