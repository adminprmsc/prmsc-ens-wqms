import { useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  normalizePlaceName,
  scorePlaceName,
} from '@/lib/location-search'
import type { LocationOption } from '@/lib/locations-api'

type LocationPickerProps = {
  options: LocationOption[]
  value: string
  onChange: (id: string) => void
  placeholder: string
  searchPlaceholder?: string
  disabled?: boolean
  emptyLabel?: string
}

export function LocationPicker({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder = 'Search by name',
  disabled,
  emptyLabel,
}: LocationPickerProps) {
  const [query, setQuery] = useState('')
  const showSearch = options.length > 8
  const selectValue = value || (emptyLabel ? '__all__' : null)

  const filtered = useMemo(() => {
    const needle = query.trim()
    if (!needle) return options
    const normalized = normalizePlaceName(needle)
    return options
      .map((option) => ({
        option,
        score: Math.max(
          scorePlaceName(needle, option.name),
          normalizePlaceName(option.name).includes(normalized) ? 60 : 0,
        ),
      }))
      .filter((row) => row.score >= 40)
      .sort((left, right) => right.score - left.score)
      .map((row) => row.option)
  }, [options, query])

  return (
    <Select
      value={selectValue}
      disabled={disabled}
      items={[
        ...(emptyLabel ? [{ value: '__all__', label: emptyLabel }] : []),
        ...options.map((option) => ({
          value: option.id,
          label: option.name,
        })),
      ]}
      onValueChange={(next) => {
        if (!next || next === '__all__') onChange('')
        else onChange(String(next))
      }}
      onOpenChange={(open) => {
        if (!open) setQuery('')
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {showSearch ? (
          <div
            className="sticky top-0 z-10 bg-popover p-1"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              autoComplete="off"
            />
          </div>
        ) : null}
        {emptyLabel ? (
          <SelectItem value="__all__">{emptyLabel}</SelectItem>
        ) : null}
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            No matching place
          </p>
        ) : (
          filtered.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}
