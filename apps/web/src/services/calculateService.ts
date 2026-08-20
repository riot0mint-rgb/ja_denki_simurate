import { BillingCalculator, CalculationInput, Decimal } from '@ja-denki-simulator/calc-core'
import { jadenRatenA, jadenRatenS, chugokuRatenA } from '../data/rates'

const calculator = new BillingCalculator()

export interface ComparisonData {
  usageKwh: number
  currentProviderPlan: string
  currentProviderCharge: number
  jadenRatenACharge: number
  jadenRatenSCharge: number
  recommendedPlan: 'raten_a' | 'raten_s'
  monthlySavings: number
  annualSavings: number
  monthlySavingsPercent: number
  campaignBonus: number
  estimatedNetSavings: number
}

const PLAN_BREAKPOINT_KWH = 217
const CAMPAIGN_DISCOUNT_MONTHLY = 1000
const CAMPAIGN_MONTHS = 3

export function calculateComparison(usageKwh: number, currentProvider: string): ComparisonData {
  const usageDecimal = new Decimal(usageKwh)

  // 中国電力との比較
  let currentProviderCharge: Decimal
  if (currentProvider === 'chugoku') {
    const currentInput: CalculationInput = {
      usageKwh,
      plan: chugokuRatenA
    }
    const currentBill = calculator.calculateMonthlyBill(currentInput)
    currentProviderCharge = currentBill.afterRounding
  } else {
    currentProviderCharge = new Decimal('0')
  }

  // JAでんき 従量電灯A での計算
  const inputA: CalculationInput = {
    usageKwh,
    plan: jadenRatenA
  }
  const billA = calculator.calculateMonthlyBill(inputA)

  // JAでんき 従量電灯S での計算
  const inputS: CalculationInput = {
    usageKwh,
    plan: jadenRatenS
  }
  const billS = calculator.calculateMonthlyBill(inputS)

  // プラン選択: 分岐点で比較
  const recommendedPlan = usageDecimal.lessThanOrEqualTo(PLAN_BREAKPOINT_KWH) ? 'raten_s' : 'raten_a'
  const recommendedCharge = recommendedPlan === 'raten_a' ? billA.afterRounding : billS.afterRounding

  // 月額削減額
  const monthlySavings = currentProviderCharge.minus(recommendedCharge)

  // 年額削減額
  const annualSavings = monthlySavings.times(12)

  // 削減率
  const monthlySavingsPercent = currentProviderCharge.isZero()
    ? new Decimal('0')
    : monthlySavings.dividedBy(currentProviderCharge).times(100)

  // キャンペーン割引（初期3か月×1000円）
  const campaignBonus = new Decimal(CAMPAIGN_DISCOUNT_MONTHLY).times(CAMPAIGN_MONTHS)

  // ネット削減額（キャンペーン含む）
  const estimatedNetSavings = annualSavings.plus(campaignBonus)

  return {
    usageKwh,
    currentProviderPlan: `${currentProvider === 'chugoku' ? '中国電力' : currentProvider} 従量電灯A`,
    currentProviderCharge: Number(currentProviderCharge.toFixed(0)),
    jadenRatenACharge: Number(billA.afterRounding.toFixed(0)),
    jadenRatenSCharge: Number(billS.afterRounding.toFixed(0)),
    recommendedPlan,
    monthlySavings: Number(monthlySavings.toFixed(0)),
    annualSavings: Number(annualSavings.toFixed(0)),
    monthlySavingsPercent: Number(monthlySavingsPercent.toFixed(2)),
    campaignBonus: Number(campaignBonus.toFixed(0)),
    estimatedNetSavings: Number(estimatedNetSavings.toFixed(0))
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

export function formatPercentage(percent: number, decimalPlaces: number = 1): string {
  return `${percent.toFixed(decimalPlaces)}%`
}
