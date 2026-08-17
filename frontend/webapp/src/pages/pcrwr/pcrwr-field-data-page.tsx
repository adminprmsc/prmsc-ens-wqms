import { Link, useParams } from 'react-router-dom'

import { ReportEntryForm } from '@/components/water-quality/report-entry-form'
import { PageHeader } from '@/components/app/page-header'
import { buttonVariants } from '@/components/ui/button'
import { pcrwrRecordsPath } from '@/lib/routes'

export function PcrwrFieldDataPage() {
  const { reportId } = useParams<{ reportId?: string }>()
  const isEditing = Boolean(reportId)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Laboratory capture"
        title={isEditing ? 'Edit report' : 'Field data'}
        description={
          isEditing
            ? 'Correct this unsubmitted report, then save or send it to PRMSC review.'
            : 'Import a PCRWR NWQL report or enter results by hand. Location hierarchy, GPS pairing, custody dates, and NSDWQ limits are validated before a draft can go to PRMSC.'
        }
        actions={
          isEditing ? (
            <Link
              to={pcrwrRecordsPath()}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Back to records
            </Link>
          ) : null
        }
      />
      <ReportEntryForm reportId={reportId} />
    </div>
  )
}
