import { apiRequest } from '@/lib/api'

export type LocationOption = {
  id: string
  name: string
  _count?: { villages?: number; settlements?: number }
}

export function listTehsils() {
  return apiRequest<LocationOption[]>('/locations/tehsils')
}

export function listVillages(tehsilId: string) {
  return apiRequest<LocationOption[]>(`/locations/tehsils/${tehsilId}/villages`)
}

export function listSettlements(villageId: string) {
  return apiRequest<LocationOption[]>(
    `/locations/villages/${villageId}/settlements`,
  )
}
