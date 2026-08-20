import { Decimal } from './decimal-config.js';
import {
  BillResult,
  CalculationInput,
  CapacityTieredPlan,
  ChargeLine,
  DemandFlatPlan,
  DemandSeasonalPlan,
  EconomyNightPlan,
  FamilyBand,
  FamilyTimePlan,
  FlatRatePlan,
  FuelAdjustment,
  MonthlyBill,
  RatePlan,
  RenewableLevy,
  TieredMinimumPlan,
  TimeOfUsePlan,
  TouBand,
  UsageInput
} from './models.js';
import { applyRounding, roundDownToYen } from './rounding.js';
import { validateUsageKwh } from './utils.js';

const TOU_BAND_LABEL: Record<TouBand, string> = {
  dayOther: 'デイタイムその他季',
  daySummer: 'デイタイム夏季',
  night: 'ナイトタイム',
  holiday: 'ホリデータイム'
};

const FAMILY_BAND_LABEL: Record<FamilyBand, string> = {
  daySummer: 'デイタイム夏季',
  dayOther: 'デイタイムその他季',
  family: 'ファミリータイム',
  night: 'ナイトタイム'
};

/** 基本料金に含まれる契約容量。時間帯別・ファミリータイムとも 10（kW / kVA）。 */
const TOU_BASE_INCLUDED_KW = 10;

function unsupported(reason: string, nextSteps: string[]): BillResult {
  return { status: 'unsupported', reason, nextSteps };
}

/**
 * 公式試算表と同一の手順で月額電気料金を算出する。
 *
 * 各プラン構造は元資料のどのシートに対応するかを private メソッドの
 * コメントに記載している。丸めの位置・半額ルール・割引上限は
 * すべて元資料の数式をそのまま写している。
 */
export class BillingCalculator {
  calculate(input: CalculationInput): BillResult {
    const { plan, usage } = input;
    switch (plan.structure) {
      case 'tiered_minimum':
        return this.withTotalKwh(usage, kwh =>
          this.tieredMinimum(kwh, plan, input.fuelAdjustment, input.renewableLevy)
        );
      case 'flat_rate':
        return this.withTotalKwh(usage, kwh =>
          this.flatRate(kwh, plan, input.fuelAdjustment, input.renewableLevy)
        );
      case 'capacity_tiered':
        return this.capacityTiered(input, plan);
      case 'demand_seasonal':
        return this.demandSeasonal(input, plan);
      case 'time_of_use':
        return this.timeOfUse(input, plan);
      case 'demand_flat':
        return this.demandFlat(input, plan);
      case 'family_time':
        return this.familyTime(input, plan);
      case 'economy_night':
        return this.economyNight(input, plan);
    }
  }

  private withTotalKwh(usage: UsageInput, build: (kwh: Decimal) => MonthlyBill): BillResult {
    const kwh = usage.totalKwh;
    if (kwh === undefined) {
      return unsupported('ご使用量（kWh）が入力されていません', [
        '検針票の「ご使用量」欄を入力してください'
      ]);
    }
    const validation = validateUsageKwh(kwh);
    if (!validation.valid) {
      return unsupported(validation.reason, [
        'ご使用量（kWh）を検針票のとおりに入力してください',
        '0 以上の数値のみ計算できます'
      ]);
    }
    return { status: 'ok', bill: build(new Decimal(kwh)) };
  }

  private requireContract(
    value: number | undefined,
    label: string,
    unit: string
  ): { ok: true; value: Decimal } | { ok: false; result: BillResult } {
    if (value === undefined || !Number.isFinite(value) || value <= 0) {
      return {
        ok: false,
        result: unsupported(`${label}が入力されていません`, [
          `検針票の「${label}」欄（${unit}）を確認して入力してください`
        ])
      };
    }
    return { ok: true, value: new Decimal(value) };
  }

  /**
   * 最低料金 + 段階制。
   * 出典: ①明細 VS従量Ａ / ☆au Mプラン明細
   *   (1) 最低料金        = 定額（最初の15kWh分を含む）
   *   (2)(3)(4) 段階料金  = 単価 × 各段階の課金kWh（15kWh超から）
   *   (6) 従量料金合計    = 丸め((1)+(2)+(3)+(4))
   *   (9) 燃調            = 丸め(15kWh分定額 + 単価 × MAX(使用量-15,0))
   *  (12) 賦課金          = 切り捨て(単価 × MAX(使用量,15))
   *       電気料金        = 丸め((6)+(9)+(12))
   */
  private tieredMinimum(
    usage: Decimal,
    plan: TieredMinimumPlan,
    fuel: FuelAdjustment,
    levy: RenewableLevy
  ): MonthlyBill {
    const included = new Decimal(plan.minimumIncludedKwh);
    const lines: ChargeLine[] = [];
    let energySubtotal = new Decimal('0');
    let charged = new Decimal('0');

    for (const tier of plan.tiers) {
      const kwh =
        tier.endKwh === null
          ? Decimal.max(usage.minus(charged).minus(included), 0)
          : Decimal.max(Decimal.min(usage, tier.endKwh).minus(tier.startKwh), 0);
      charged = charged.plus(kwh);
      const amount = tier.unitPriceYenPerKwh.times(kwh);
      energySubtotal = energySubtotal.plus(amount);
      lines.push({
        label: `第${tier.tierNumber}段階`,
        quantity: kwh,
        unit: 'kWh',
        unitPrice: tier.unitPriceYenPerKwh,
        amount
      });
    }

    const energyChargeTotal = applyRounding(
      plan.minimumCharge.plus(energySubtotal),
      plan.rounding.energyTotal
    );
    const metered = Decimal.max(usage.minus(included), 0);
    const fuelCharge = applyRounding(
      fuel.minimumCharge.plus(fuel.unitPriceYenPerKwh.times(metered)),
      plan.rounding.fuelSubtotal
    );
    const levyCharge = applyRounding(
      levy.unitPriceYenPerKwh.times(Decimal.max(usage, included)),
      plan.rounding.levySubtotal
    );
    const total = applyRounding(
      energyChargeTotal.plus(fuelCharge).plus(levyCharge),
      plan.rounding.finalTotal
    );

    return this.assemble(plan, {
      baseCharge: plan.minimumCharge,
      baseLabel: `最低料金（${plan.minimumIncludedKwh}kWhまで含む）`,
      lines,
      energySubtotal,
      energyChargeTotal,
      discount: new Decimal('0'),
      fuelCharge,
      levyCharge,
      totalKwh: usage,
      total,
      notes: []
    });
  }

  /**
   * 0kWh から一律単価。
   * 出典: ①明細 VSシンプル I20
   *   電気料金 = IF((従量+燃調) < 閾値, 最低月額請求額, 切り捨て(従量+燃調+賦課金))
   */
  private flatRate(
    usage: Decimal,
    plan: FlatRatePlan,
    fuel: FuelAdjustment,
    levy: RenewableLevy
  ): MonthlyBill {
    const energy = plan.unitPriceYenPerKwh.times(usage);
    // 基本料金を持たない構造なので、energyTotal はそのまま電力量料金に掛かる
    const energyChargeTotal = applyRounding(energy, plan.rounding.energyTotal);
    const fuelCharge = applyRounding(
      fuel.unitPriceYenPerKwh.times(usage),
      plan.rounding.fuelSubtotal
    );
    const levyCharge = applyRounding(
      levy.unitPriceYenPerKwh.times(usage),
      plan.rounding.levySubtotal
    );
    const beforeLevy = energyChargeTotal.plus(fuelCharge);
    const applied = beforeLevy.lessThan(plan.minimumMonthlyThreshold);
    const total = applied
      ? plan.minimumMonthlyBill
      : applyRounding(beforeLevy.plus(levyCharge), plan.rounding.finalTotal);

    return this.assemble(plan, {
      baseCharge: new Decimal('0'),
      baseLabel: '基本料金なし',
      lines: [
        {
          label: '電力量料金（一律）',
          quantity: usage,
          unit: 'kWh',
          unitPrice: plan.unitPriceYenPerKwh,
          amount: energy
        }
      ],
      energySubtotal: energy,
      energyChargeTotal,
      discount: new Decimal('0'),
      fuelCharge,
      levyCharge,
      totalKwh: usage,
      total,
      minimumApplied: applied,
      notes: applied
        ? [
            `従量料金と燃料費調整額の合計が最低月額料金 ${plan.minimumMonthlyThreshold.toFixed(2)}円 に満たないため、${plan.minimumMonthlyBill.toFixed(0)}円 を適用しました`
          ]
        : []
    });
  }

  /**
   * 契約容量課金 + 0kWh からの段階制（従量電灯B）。
   * 出典: ②明細
   *   (1) 基本料金 = 単価/kVA × 契約kVA （使用量0なら単価半額）
   *   (2) 第1段階 = 単価 × MIN(使用量,120)     ← 0kWh から
   *   (3) 第2段階 = 単価 × MAX(MIN(使用量,300)-120,0)
   *   (4) 第3段階 = IF(使用量<15, 0, 使用量-第1-第2)
   *   賦課金に ROUNDDOWN がない点も元資料どおり。
   */
  private capacityTiered(input: CalculationInput, plan: CapacityTieredPlan): BillResult {
    const kva = this.requireContract(input.usage.contractKva, 'ご契約容量', 'kVA');
    if (!kva.ok) return kva.result;

    return this.withTotalKwh(input.usage, usage => {
      const noUsage = usage.isZero();
      const baseUnit =
        plan.halveBaseWhenNoUsage && noUsage
          ? plan.baseChargePerKva.dividedBy(2)
          : plan.baseChargePerKva;
      const baseCharge = baseUnit.times(kva.value);

      const lines: ChargeLine[] = [];
      let energySubtotal = new Decimal('0');
      let charged = new Decimal('0');
      for (const tier of plan.tiers) {
        const kwh =
          tier.endKwh === null
            ? usage.lessThan(15)
              ? new Decimal('0')
              : usage.minus(charged)
            : Decimal.max(Decimal.min(usage, tier.endKwh).minus(tier.startKwh), 0);
        charged = charged.plus(kwh);
        const amount = tier.unitPriceYenPerKwh.times(kwh);
        energySubtotal = energySubtotal.plus(amount);
        lines.push({
          label: `第${tier.tierNumber}段階`,
          quantity: kwh,
          unit: 'kWh',
          unitPrice: tier.unitPriceYenPerKwh,
          amount
        });
      }

      const fuelCharge = applyRounding(
        input.fuelAdjustment.unitPriceYenPerKwh.times(usage),
        plan.rounding.fuelSubtotal
      );
      const levyCharge = applyRounding(
        input.renewableLevy.unitPriceYenPerKwh.times(usage),
        plan.rounding.levySubtotal
      );
      const energyChargeTotal = applyRounding(
        baseCharge.plus(energySubtotal),
        plan.rounding.energyTotal
      );
      const total = applyRounding(
        energyChargeTotal.plus(fuelCharge).plus(levyCharge),
        plan.rounding.finalTotal
      );

      return this.assemble(plan, {
        baseCharge,
        baseLabel: `基本料金 ${baseUnit.toFixed(2)}円 × ${kva.value.toDecimalPlaces(2).toString()}kVA`,
        lines,
        energySubtotal,
        energyChargeTotal,
        discount: new Decimal('0'),
        fuelCharge,
        levyCharge,
        totalKwh: usage,
        total,
        notes: noUsage && plan.halveBaseWhenNoUsage ? ['使用量が0kWhのため基本料金が半額です'] : []
      });
    });
  }

  /**
   * 契約電力課金 + 季節別単価（低圧電力）。
   * 出典: ⑤明細 / ☆au低圧電力明細
   */
  private demandSeasonal(input: CalculationInput, plan: DemandSeasonalPlan): BillResult {
    const kw = this.requireContract(input.usage.contractKw, 'ご契約電力', 'kW');
    if (!kw.ok) return kw.result;

    const seasonal = input.usage.seasonal;
    if (!seasonal) {
      return unsupported('季節別のご使用量が入力されていません', [
        '夏季（7/1〜9/30）とその他季のご使用量をそれぞれ入力してください'
      ]);
    }
    for (const [label, v] of [
      ['夏季のご使用量', seasonal.summerKwh],
      ['その他季のご使用量', seasonal.otherKwh]
    ] as const) {
      const check = validateUsageKwh(v);
      if (!check.valid) return unsupported(`${label}: ${check.reason}`, ['0 以上の数値を入力してください']);
    }

    const summer = new Decimal(seasonal.summerKwh);
    const other = new Decimal(seasonal.otherKwh);
    const usage = summer.plus(other);
    const noUsage = usage.isZero();
    const baseUnit =
      plan.halveBaseWhenNoUsage && noUsage ? plan.baseChargePerKw.dividedBy(2) : plan.baseChargePerKw;
    const baseCharge = baseUnit.times(kw.value);

    const lines: ChargeLine[] = [
      {
        label: 'その他季（4/1〜6/30, 10/1〜3/31）',
        quantity: other,
        unit: 'kWh',
        unitPrice: plan.otherUnitPriceYenPerKwh,
        amount: plan.otherUnitPriceYenPerKwh.times(other)
      },
      {
        label: '夏季（7/1〜9/30）',
        quantity: summer,
        unit: 'kWh',
        unitPrice: plan.summerUnitPriceYenPerKwh,
        amount: plan.summerUnitPriceYenPerKwh.times(summer)
      }
    ];
    const energySubtotal = lines.reduce((a, l) => a.plus(l.amount), new Decimal('0'));
    const fuelCharge = applyRounding(
      input.fuelAdjustment.unitPriceYenPerKwh.times(usage),
      plan.rounding.fuelSubtotal
    );
    const levyCharge = applyRounding(
      input.renewableLevy.unitPriceYenPerKwh.times(usage),
      plan.rounding.levySubtotal
    );
    const energyChargeTotal = applyRounding(
      baseCharge.plus(energySubtotal),
      plan.rounding.energyTotal
    );
    const total = applyRounding(
      energyChargeTotal.plus(fuelCharge).plus(levyCharge),
      plan.rounding.finalTotal
    );

    return {
      status: 'ok',
      bill: this.assemble(plan, {
        baseCharge,
        baseLabel: `基本料金 ${baseUnit.toFixed(3)}円 × ${kw.value.toFixed(1)}kW`,
        lines,
        energySubtotal,
        energyChargeTotal,
        discount: new Decimal('0'),
        fuelCharge,
        levyCharge,
        totalKwh: usage,
        total,
        notes: noUsage && plan.halveBaseWhenNoUsage ? ['使用量が0kWhのため基本料金が半額です'] : []
      })
    };
  }

  /**
   * 時間帯別（電化Style／ナイトホリデー／夜トクプラン）。
   * 出典: ③明細 VS電化Style / VSナイトホリデー、④各結果シート
   *   (1) 基本料金 10kWまで = 定額（使用量0なら半額）
   *   (2) 10kW超過          = 単価 × MAX(契約kW-10, 0)
   *   (4)〜(7) 電力量料金    = 各時間帯単価 × 各時間帯kWh
   *   (9) 燃調              = 単価 × 総使用量（15kWh分割なし）
   *  (10) 賦課金            = 切り捨て(単価 × 総使用量)
   *       電気料金          = 切り捨て((3)+(8)+電化住宅割+(9)+(10))
   */
  private timeOfUse(input: CalculationInput, plan: TimeOfUsePlan): BillResult {
    const hasBaseCharge =
      plan.baseChargeUpTo10Kw !== null && plan.baseChargePerKwOver10 !== null;

    if (!hasBaseCharge && plan.minimumMonthly === null) {
      return unsupported(`${plan.planName}の基本料金が元資料に記載されていないため計算できません`, [
        '公式試算表の該当シートに基本料金の記載がありません',
        'お手数ですが営業担当にお問い合わせください'
      ]);
    }

    // 最低月額料金型は契約電力に応じた課金がないため、契約電力の入力を求めない。
    let contractKw: Decimal | null = null;
    if (hasBaseCharge) {
      const kw = this.requireContract(input.usage.contractKw, 'ご契約電力', 'kW');
      if (!kw.ok) return kw.result;
      contractKw = kw.value;
    }

    const tou = input.usage.tou;
    if (!tou) {
      return unsupported('時間帯別のご使用量が入力されていません', [
        '検針票の時間帯ごとのご使用量を入力してください'
      ]);
    }

    const bands: TouBand[] = ['dayOther', 'daySummer', 'night', 'holiday'];
    const amounts: Record<string, Decimal> = {};
    for (const band of bands) {
      const v = tou[band] ?? 0;
      const check = validateUsageKwh(v);
      if (!check.valid) {
        return unsupported(`${TOU_BAND_LABEL[band]}: ${check.reason}`, [
          '0 以上の数値を入力してください'
        ]);
      }
      amounts[band] = new Decimal(v);
    }

    const usage = bands.reduce((a, b) => a.plus(amounts[b]), new Decimal('0'));
    const noUsage = usage.isZero();
    const half = (d: Decimal) => (plan.halveBaseWhenNoUsage && noUsage ? d.dividedBy(2) : d);
    const overKw = contractKw
      ? Decimal.max(contractKw.minus(TOU_BASE_INCLUDED_KW), 0)
      : new Decimal('0');
    const baseCharge = hasBaseCharge
      ? half(plan.baseChargeUpTo10Kw!).plus(half(plan.baseChargePerKwOver10!).times(overKw))
      : new Decimal('0');

    const lines: ChargeLine[] = bands.map(band => ({
      label: TOU_BAND_LABEL[band],
      quantity: amounts[band],
      unit: 'kWh',
      unitPrice: plan.unitPrices[band],
      amount: plan.unitPrices[band].times(amounts[band])
    }));
    const energySubtotal = lines.reduce((a, l) => a.plus(l.amount), new Decimal('0'));

    const { discount, notes } = this.allElectricDiscount(
      plan.allElectricDiscount,
      input.usage.allElectricDiscount,
      baseCharge.plus(energySubtotal)
    );

    const fuelCharge = applyRounding(
      input.fuelAdjustment.unitPriceYenPerKwh.times(usage),
      plan.rounding.fuelSubtotal
    );
    const levyCharge = applyRounding(
      input.renewableLevy.unitPriceYenPerKwh.times(usage),
      plan.rounding.levySubtotal
    );
    // 最低月額料金型は、従量料金と燃料費調整額の合計が閾値に満たない月だけ
    // 最低月額料金を請求する。判定は賦課金を足す前に行う（シンプルコースと同じ）。
    const energyChargeTotal = applyRounding(
      baseCharge.plus(energySubtotal),
      plan.rounding.energyTotal
    );
    const beforeLevy = energyChargeTotal.plus(discount).plus(fuelCharge);
    const minimumApplied =
      plan.minimumMonthly !== null && beforeLevy.lessThan(plan.minimumMonthly.threshold);
    const total = minimumApplied
      ? plan.minimumMonthly!.bill
      : applyRounding(beforeLevy.plus(levyCharge), plan.rounding.finalTotal);

    if (minimumApplied) {
      notes.push(
        `従量料金と燃料費調整額の合計が最低月額料金 ${plan.minimumMonthly!.threshold.toFixed(2)}円 に満たないため、${plan.minimumMonthly!.bill.toFixed(0)}円 を適用しました`
      );
    }
    if (noUsage && plan.halveBaseWhenNoUsage && hasBaseCharge) {
      notes.push('使用量が0kWhのため基本料金が半額です');
    }

    return {
      status: 'ok',
      bill: this.assemble(plan, {
        baseCharge,
        baseLabel: hasBaseCharge
          ? `基本料金（10kWまで${overKw.isZero() ? '' : ` + ${overKw.toDecimalPlaces(2).toString()}kW超過分`}）`
          : '基本料金なし（最低月額料金制）',
        lines,
        energySubtotal,
        energyChargeTotal,
        discount,
        fuelCharge,
        levyCharge,
        totalKwh: usage,
        total,
        minimumApplied,
        notes
      })
    };
  }

  /**
   * 契約電力課金 + 一律単価（深夜電力B）。
   * 出典: ⑥「深夜電力B」I11
   *   電気料金 = IF(使用量=0, 切り捨て(合計)/2, 切り捨て(合計))
   *   ※ 半額は基本料金単価ではなく請求額全体に掛かる点が他プランと異なる。
   */
  private demandFlat(input: CalculationInput, plan: DemandFlatPlan): BillResult {
    const kw = this.requireContract(input.usage.contractKw, 'ご契約電力', 'kW');
    if (!kw.ok) return kw.result;

    return this.withTotalKwh(input.usage, usage => {
      const baseCharge = plan.baseChargePerKw.times(kw.value);
      const energy = plan.unitPriceYenPerKwh.times(usage);
      const fuelCharge = applyRounding(
        input.fuelAdjustment.unitPriceYenPerKwh.times(usage),
        plan.rounding.fuelSubtotal
      );
      const levyCharge = applyRounding(
        input.renewableLevy.unitPriceYenPerKwh.times(usage),
        plan.rounding.levySubtotal
      );
      const energyChargeTotal = applyRounding(
        baseCharge.plus(energy),
        plan.rounding.energyTotal
      );
      const rounded = applyRounding(
        energyChargeTotal.plus(fuelCharge).plus(levyCharge),
        plan.rounding.finalTotal
      );
      const noUsage = usage.isZero();
      const total = plan.halveTotalWhenNoUsage && noUsage ? rounded.dividedBy(2) : rounded;

      return this.assemble(plan, {
        baseCharge,
        baseLabel: `基本料金 ${plan.baseChargePerKw.toFixed(2)}円 × ${kw.value.toFixed(1)}kW`,
        lines: [
          {
            label: '電力量料金',
            quantity: usage,
            unit: 'kWh',
            unitPrice: plan.unitPriceYenPerKwh,
            amount: energy
          }
        ],
        energySubtotal: energy,
        energyChargeTotal,
        discount: new Decimal('0'),
        fuelCharge,
        levyCharge,
        totalKwh: usage,
        total,
        notes: noUsage && plan.halveTotalWhenNoUsage ? ['使用量が0kWhのため請求額が半額です'] : []
      });
    });
  }

  /**
   * ファミリータイムⅠ/Ⅱ。
   * 出典: ④「ファミリーⅠ結果」「ファミリーⅡ結果」
   *   (1)(2) 基本料金 = 10kVAまで定額 + 超過分 × MAX(契約kVA-10, 0)
   *   (4)〜(7) 電力量料金 = 各区分の単価 × 使用量
   *   (9) 電化住宅割 = MAX((基本+電力量) × -8%, -3300)
   *  (10) 燃調   = 単価 × 総使用量
   *  (11) 賦課金 = 切り捨て(単価 × 総使用量)
   *       電気料金 = 切り捨て((3)+(8)+(9)+(10)+(11))
   */
  private familyTime(input: CalculationInput, plan: FamilyTimePlan): BillResult {
    const kva = this.requireContract(input.usage.contractKva, 'ご契約電力', 'kVA');
    if (!kva.ok) return kva.result;

    const raw = input.usage.familyTime;
    if (!raw) {
      return unsupported('時間帯別のご使用量が入力されていません', [
        '検針票のデイタイム・ファミリータイム・ナイトタイムのご使用量を入力してください'
      ]);
    }

    const bands: FamilyBand[] = ['daySummer', 'dayOther', 'family', 'night'];
    const amounts: Record<string, Decimal> = {};
    for (const band of bands) {
      const v = raw[band] ?? 0;
      const check = validateUsageKwh(v);
      if (!check.valid) {
        return unsupported(`${FAMILY_BAND_LABEL[band]}: ${check.reason}`, [
          '0 以上の数値を入力してください'
        ]);
      }
      amounts[band] = new Decimal(v);
    }

    const usage = bands.reduce((a, b) => a.plus(amounts[b]), new Decimal('0'));
    const overKva = Decimal.max(kva.value.minus(TOU_BASE_INCLUDED_KW), 0);
    const baseCharge = plan.baseChargeUpTo10Kva.plus(plan.baseChargePerKvaOver10.times(overKva));

    const lines: ChargeLine[] = bands.map(band => ({
      label: FAMILY_BAND_LABEL[band],
      quantity: amounts[band],
      unit: 'kWh',
      unitPrice: plan.unitPrices[band],
      amount: plan.unitPrices[band].times(amounts[band])
    }));
    const energySubtotal = lines.reduce((a, l) => a.plus(l.amount), new Decimal('0'));

    const { discount, notes } = this.allElectricDiscount(
      plan.allElectricDiscount,
      input.usage.allElectricDiscount,
      baseCharge.plus(energySubtotal)
    );

    const fuelCharge = applyRounding(
      input.fuelAdjustment.unitPriceYenPerKwh.times(usage),
      plan.rounding.fuelSubtotal
    );
    const levyCharge = applyRounding(
      input.renewableLevy.unitPriceYenPerKwh.times(usage),
      plan.rounding.levySubtotal
    );
    const energyChargeTotal = applyRounding(
      baseCharge.plus(energySubtotal),
      plan.rounding.energyTotal
    );
    const total = applyRounding(
      energyChargeTotal.plus(discount).plus(fuelCharge).plus(levyCharge),
      plan.rounding.finalTotal
    );

    return {
      status: 'ok',
      bill: this.assemble(plan, {
        baseCharge,
        baseLabel: `基本料金（10kVAまで${overKva.isZero() ? '' : ` + ${overKva.toDecimalPlaces(2).toString()}kVA超過分`}）`,
        lines,
        energySubtotal,
        energyChargeTotal,
        discount,
        fuelCharge,
        levyCharge,
        totalKwh: usage,
        total,
        notes
      })
    };
  }

  /**
   * 時間帯別電灯（エコノミーナイト）。
   * 出典: ④「時間帯別結果」
   *   昼間時間だけが 0kWh 起点の 3 段階、夜間は一律単価。
   */
  private economyNight(input: CalculationInput, plan: EconomyNightPlan): BillResult {
    const kva = this.requireContract(input.usage.contractKva, 'ご契約電力', 'kVA');
    if (!kva.ok) return kva.result;

    const raw = input.usage.economyNight;
    if (!raw) {
      return unsupported('昼間・夜間のご使用量が入力されていません', [
        '検針票の昼間時間・夜間時間のご使用量を入力してください'
      ]);
    }
    for (const [label, v] of [
      ['昼間時間のご使用量', raw.dayKwh],
      ['夜間時間のご使用量', raw.nightKwh]
    ] as const) {
      const check = validateUsageKwh(v);
      if (!check.valid) return unsupported(`${label}: ${check.reason}`, ['0 以上の数値を入力してください']);
    }

    const day = new Decimal(raw.dayKwh);
    const night = new Decimal(raw.nightKwh);
    const usage = day.plus(night);
    const overKva = Decimal.max(kva.value.minus(TOU_BASE_INCLUDED_KW), 0);
    const baseCharge = plan.baseChargeUpTo10Kva.plus(plan.baseChargePerKvaOver10.times(overKva));

    const lines: ChargeLine[] = [];
    for (const tier of plan.dayTiers) {
      const kwh =
        tier.endKwh === null
          ? Decimal.max(day.minus(tier.startKwh), 0)
          : Decimal.max(Decimal.min(day, tier.endKwh).minus(tier.startKwh), 0);
      lines.push({
        label: `昼間時間 第${tier.tierNumber}段階`,
        quantity: kwh,
        unit: 'kWh',
        unitPrice: tier.unitPriceYenPerKwh,
        amount: tier.unitPriceYenPerKwh.times(kwh)
      });
    }
    lines.push({
      label: '夜間時間',
      quantity: night,
      unit: 'kWh',
      unitPrice: plan.nightUnitPriceYenPerKwh,
      amount: plan.nightUnitPriceYenPerKwh.times(night)
    });
    const energySubtotal = lines.reduce((a, l) => a.plus(l.amount), new Decimal('0'));

    const fuelCharge = applyRounding(
      input.fuelAdjustment.unitPriceYenPerKwh.times(usage),
      plan.rounding.fuelSubtotal
    );
    const levyCharge = applyRounding(
      input.renewableLevy.unitPriceYenPerKwh.times(usage),
      plan.rounding.levySubtotal
    );
    const energyChargeTotal = applyRounding(
      baseCharge.plus(energySubtotal),
      plan.rounding.energyTotal
    );
    const total = applyRounding(
      energyChargeTotal.plus(fuelCharge).plus(levyCharge),
      plan.rounding.finalTotal
    );

    return {
      status: 'ok',
      bill: this.assemble(plan, {
        baseCharge,
        baseLabel: `基本料金（10kVAまで${overKva.isZero() ? '' : ` + ${overKva.toDecimalPlaces(2).toString()}kVA超過分`}）`,
        lines,
        energySubtotal,
        energyChargeTotal,
        discount: new Decimal('0'),
        fuelCharge,
        levyCharge,
        totalKwh: usage,
        total,
        notes: []
      })
    };
  }

  /** 電化住宅割。定率割引を上限額でクリップする（④結果シート H15）。 */
  private allElectricDiscount(
    terms: { rate: Decimal; capYen: Decimal } | null,
    applied: boolean | undefined,
    baseAndEnergy: Decimal
  ): { discount: Decimal; notes: string[] } {
    if (!terms || !applied) return { discount: new Decimal('0'), notes: [] };
    const raw = baseAndEnergy.times(terms.rate).negated();
    return {
      discount: Decimal.max(raw, terms.capYen.negated()),
      notes: [
        `電化住宅割 ${terms.rate.times(100).toFixed(0)}%（上限 ${terms.capYen.toFixed(0)}円）を適用`
      ]
    };
  }

  private assemble(
    plan: RatePlan,
    parts: {
      baseCharge: Decimal;
      baseLabel: string;
      lines: ChargeLine[];
      energySubtotal: Decimal;
      energyChargeTotal: Decimal;
      discount: Decimal;
      fuelCharge: Decimal;
      levyCharge: Decimal;
      totalKwh: Decimal;
      total: Decimal;
      notes: string[];
      /** 最低月額料金で請求額を置き換えたか。内訳の書き方が変わる */
      minimumApplied?: boolean;
    }
  ): MonthlyBill {
    const usedLines = parts.lines.filter(l => l.quantity === null || l.quantity.greaterThan(0));
    const desc = usedLines
      // 按分した使用量には端数が出る。0桁で丸めると紙の上で掛け算が合わなくなる
      // （44.40円 × 67kWh = 2982.73円 のように見えてしまう）
      .map(
        l =>
          `${l.label}: ${l.unitPrice?.toFixed(2)}円 × ${l.quantity?.toDecimalPlaces(2).toString()}${l.unit} = ${l.amount.toFixed(2)}円`
      )
      .join(' + ');

    // 最低月額料金を適用した月は、内訳を足しても請求額にならない。
    // 紙に出す以上、足し算が合わない表を出さずに置き換えを明示する
    const tail = parts.minimumApplied
      ? [`最低月額料金を適用: ${parts.total.toFixed(0)}円`]
      : [
          `再エネ賦課金: ${parts.levyCharge.toDecimalPlaces(2).toString()}円`,
          `合計: ${parts.total.toFixed(2)}円`
        ];

    const formula = [
      `${parts.baseLabel}: ${parts.baseCharge.toFixed(2)}円`,
      desc || '電力量料金: 0円',
      ...(parts.discount.isZero() ? [] : [`割引: ${parts.discount.toFixed(2)}円`]),
      `燃料費調整額: ${parts.fuelCharge.toFixed(2)}円`,
      ...tail
    ].join(' → ');

    return {
      planId: plan.planId,
      planName: plan.planName,
      baseCharge: parts.baseCharge,
      lines: parts.lines,
      energySubtotal: parts.energySubtotal,
      energyChargeTotal: parts.energyChargeTotal,
      discount: parts.discount,
      fuelAdjustment: parts.fuelCharge,
      renewableLevy: parts.levyCharge,
      totalKwh: parts.totalKwh,
      notes: parts.notes,
      total: parts.total,
      formula,
      sources: plan.sources
    };
  }
}

export const calculator = new BillingCalculator();
