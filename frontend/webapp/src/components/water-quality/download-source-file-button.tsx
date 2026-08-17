import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ApiError } from '@/lib/api'
import { downloadReportDocument } from '@/lib/water-quality-api'

export function DownloadSourceFileButton({
  reportId,
  fileName,
  size = 'sm',
}: {
  reportId: string
  fileName?: string | null
  size?: 'sm' | 'xs'
}) {
  const [busy, setBusy] = useState(false)
  if (!fileName) return null

  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        downloadReportDocument(reportId)
          .then(() => toast.success(`Downloaded ${fileName}`))
          .catch((error) => {
            toast.error(
              error instanceof ApiError
                ? error.message
                : 'Unable to download the original laboratory file',
            )
          })
          .finally(() => setBusy(false))
      }}
    >
      {busy ? <Spinner /> : <Download />}
      Download original
    </Button>
  )
}
