/**
 * 取得した燃調・賦課金の値を、現在の記録済みデータと突き合わせる（フェーズ6-b）。
 *
 * CLAUDE.md ルール10の例外条項により、**新しい年月の追加のみ自動反映してよい**。
 * 既存の年月と値が食い違う場合は自動反映せず、必ず人が確認する（conflict として報告する）。
 */

export interface FetchedFuelEntry {
  period: string
  minimumCharge: string
  unitPriceYenPerKwh: string
  from?: string
}

export interface FetchedLevyEntry {
  period: string
  unitPriceYenPerKwh: string
}

export interface FuelDiffResult {
  toAdd: FetchedFuelEntry[]
  conflicts: Array<{ period: string; current: { minimumCharge: string; unitPriceYenPerKwh: string }; fetched: FetchedFuelEntry }>
  unchanged: string[]
}

export function diffFuelEntries(
  current: Record<string, { minimumCharge: string; unitPriceYenPerKwh: string }>,
  fetched: FetchedFuelEntry[]
): FuelDiffResult {
  const toAdd: FetchedFuelEntry[] = []
  const conflicts: FuelDiffResult['conflicts'] = []
  const unchanged: string[] = []

  for (const entry of fetched) {
    const existing = current[entry.period]
    if (!existing) {
      toAdd.push(entry)
      continue
    }
    if (existing.minimumCharge === entry.minimumCharge && existing.unitPriceYenPerKwh === entry.unitPriceYenPerKwh) {
      unchanged.push(entry.period)
      continue
    }
    conflicts.push({ period: entry.period, current: existing, fetched: entry })
  }

  return { toAdd, conflicts, unchanged }
}

export interface LevyDiffResult {
  toAdd: FetchedLevyEntry[]
  conflicts: Array<{ period: string; current: string; fetched: string }>
  unchanged: string[]
}

export function diffLevyEntries(
  current: Record<string, string>,
  fetched: FetchedLevyEntry[]
): LevyDiffResult {
  const toAdd: FetchedLevyEntry[] = []
  const conflicts: LevyDiffResult['conflicts'] = []
  const unchanged: string[] = []

  for (const entry of fetched) {
    const existing = current[entry.period]
    if (existing === undefined) {
      toAdd.push(entry)
      continue
    }
    if (existing === entry.unitPriceYenPerKwh) {
      unchanged.push(entry.period)
      continue
    }
    conflicts.push({ period: entry.period, current: existing, fetched: entry.unitPriceYenPerKwh })
  }

  return { toAdd, conflicts, unchanged }
}
