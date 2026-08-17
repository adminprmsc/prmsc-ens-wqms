import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type SectionCardProps = {
  step?: string
  icon?: LucideIcon
  title: string
  description?: string
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  headerClassName?: string
  contentClassName?: string
}

export function SectionCard({
  step,
  icon: Icon,
  title,
  description,
  actions,
  footer,
  children,
  className,
  headerClassName,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className={cn('border-border/80 shadow-none', className)}>
      <CardHeader
        className={cn(
          'border-b border-border/70 bg-muted/35 py-4',
          headerClassName,
        )}
      >
        <div className="flex items-start gap-3">
          {step || Icon ? (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15">
              {step ? (
                <span className="text-[11px] font-semibold tracking-wide">
                  {step}
                </span>
              ) : Icon ? (
                <Icon className="size-4" />
              ) : null}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <CardTitle className="text-[15px] font-semibold">{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-0.5 text-[13px] leading-relaxed">
                {description}
              </CardDescription>
            ) : null}
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent className={cn('pt-5', contentClassName)}>{children}</CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  )
}
