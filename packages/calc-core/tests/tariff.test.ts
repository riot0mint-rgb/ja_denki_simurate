import Decimal from 'decimal.js';
import { calculateTieredCharge, sumTierCharges } from '../src/tariff';
import { fixtures } from './fixtures';

describe('Tariff - 段階別料金計算', () => {
  describe('従量電灯A での段階別計算', () => {
    it('15 kWh 時は段階1のみ適用されること', () => {
      const result = calculateTieredCharge(15, fixtures.jadenRatenA);
      expect(result.length).toBe(1);
      expect(result[0].tierNumber).toBe(1);
      expect(result[0].chargedKwh).toEqual(new Decimal('15'));
    });

    it('16 kWh 時は段階1と段階2が適用されること', () => {
      const result = calculateTieredCharge(16, fixtures.jadenRatenA);
      expect(result.length).toBe(2);
      expect(result[0].tierNumber).toBe(1);
      expect(result[0].chargedKwh).toEqual(new Decimal('15'));
      expect(result[1].tierNumber).toBe(2);
      expect(result[1].chargedKwh).toEqual(new Decimal('1'));
    });

    it('120 kWh 時は段階1と段階2が適用されること', () => {
      const result = calculateTieredCharge(120, fixtures.jadenRatenA);
      expect(result.length).toBe(2);
      expect(result[0].chargedKwh).toEqual(new Decimal('15'));
      expect(result[1].chargedKwh).toEqual(new Decimal('105'));
    });

    it('121 kWh 時は段階1, 2, 3 が適用されること', () => {
      const result = calculateTieredCharge(121, fixtures.jadenRatenA);
      expect(result.length).toBe(3);
      expect(result[2].tierNumber).toBe(3);
      expect(result[2].chargedKwh).toEqual(new Decimal('1'));
    });

    it('300 kWh 時は段階1, 2, 3 が適用されること', () => {
      const result = calculateTieredCharge(300, fixtures.jadenRatenA);
      expect(result.length).toBe(3);
      expect(result[0].chargedKwh).toEqual(new Decimal('15'));
      expect(result[1].chargedKwh).toEqual(new Decimal('105'));
      expect(result[2].chargedKwh).toEqual(new Decimal('180'));
    });

    it('301 kWh 時は段階1, 2, 3, 4 すべてが適用されること', () => {
      const result = calculateTieredCharge(301, fixtures.jadenRatenA);
      expect(result.length).toBe(4);
      expect(result[3].tierNumber).toBe(4);
      expect(result[3].chargedKwh).toEqual(new Decimal('1'));
    });

    it('900 kWh 時の段階4の計算が正確であること', () => {
      const result = calculateTieredCharge(900, fixtures.jadenRatenA);
      expect(result.length).toBe(4);
      // 段階4: 900 - 300 = 600 kWh
      expect(result[3].chargedKwh).toEqual(new Decimal('600'));
    });
  });

  describe('段階別料金の合計', () => {
    it('15 kWh での合計が正確であること', () => {
      const calcs = calculateTieredCharge(15, fixtures.jadenRatenA);
      const total = sumTierCharges(calcs);
      // 15 × 28.50 = 427.50
      expect(total).toEqual(new Decimal('427.50'));
    });

    it('300 kWh での合計が正確であること', () => {
      const calcs = calculateTieredCharge(300, fixtures.jadenRatenA);
      const total = sumTierCharges(calcs);
      // (15 × 28.50) + (105 × 23.61) + (180 × 25.00)
      // = 427.50 + 2478.90 + 4500.00
      // = 7406.40
      const expected = new Decimal('15')
        .times('28.50')
        .plus(new Decimal('105').times('23.61'))
        .plus(new Decimal('180').times('25.00'));
      expect(total).toEqual(expected);
    });
  });

  describe('従量電灯S での計算', () => {
    it('0 kWh では料金が0円であること', () => {
      const result = calculateTieredCharge(0, fixtures.jadenRatenS);
      expect(result.length).toBe(0);
    });

    it('50 kWh では段階1のみで計算されること', () => {
      const result = calculateTieredCharge(50, fixtures.jadenRatenS);
      expect(result.length).toBe(1);
      expect(result[0].chargedKwh).toEqual(new Decimal('50'));
    });

    it('300 kWh でも段階1のみで計算されること（段階なし）', () => {
      const result = calculateTieredCharge(300, fixtures.jadenRatenS);
      expect(result.length).toBe(1);
      expect(result[0].chargedKwh).toEqual(new Decimal('300'));
    });
  });
});
