import Decimal from 'decimal.js';
import { applyRounding, getRoundingDescription } from '../src/rounding';

describe('Rounding - 端数処理', () => {
  describe('1円単位の切り捨て', () => {
    it('1234.56 を floor すると 1234 になること', () => {
      const result = applyRounding(new Decimal('1234.56'), 'floor', 'yen');
      expect(result).toEqual(new Decimal('1234'));
    });

    it('1234.01 を floor すると 1234 になること', () => {
      const result = applyRounding(new Decimal('1234.01'), 'floor', 'yen');
      expect(result).toEqual(new Decimal('1234'));
    });

    it('1234.00 は変わらないこと', () => {
      const result = applyRounding(new Decimal('1234.00'), 'floor', 'yen');
      expect(result).toEqual(new Decimal('1234'));
    });
  });

  describe('1円単位の四捨五入', () => {
    it('1234.4 を round すると 1234 になること', () => {
      const result = applyRounding(new Decimal('1234.4'), 'round', 'yen');
      expect(result).toEqual(new Decimal('1234'));
    });

    it('1234.5 を round すると 1235 になること（HALF_UP）', () => {
      const result = applyRounding(new Decimal('1234.5'), 'round', 'yen');
      expect(result).toEqual(new Decimal('1235'));
    });

    it('1234.6 を round すると 1235 になること', () => {
      const result = applyRounding(new Decimal('1234.6'), 'round', 'yen');
      expect(result).toEqual(new Decimal('1235'));
    });
  });

  describe('1円単位の切り上げ', () => {
    it('1234.01 を ceil すると 1235 になること', () => {
      const result = applyRounding(new Decimal('1234.01'), 'ceil', 'yen');
      expect(result).toEqual(new Decimal('1235'));
    });

    it('1234.00 は変わらないこと', () => {
      const result = applyRounding(new Decimal('1234.00'), 'ceil', 'yen');
      expect(result).toEqual(new Decimal('1234'));
    });
  });

  describe('10円単位での処理', () => {
    it('1234 を 10円 floor すると 1230 になること', () => {
      const result = applyRounding(new Decimal('1234'), 'floor', 'ten_yen');
      expect(result).toEqual(new Decimal('1230'));
    });

    it('1235 を 10円 round すると 1240 になること', () => {
      const result = applyRounding(new Decimal('1235'), 'round', 'ten_yen');
      expect(result).toEqual(new Decimal('1240'));
    });

    it('1234 を 10円 ceil すると 1240 になること', () => {
      const result = applyRounding(new Decimal('1234'), 'ceil', 'ten_yen');
      expect(result).toEqual(new Decimal('1240'));
    });
  });

  describe('説明の生成', () => {
    it('floor, yen の説明が正しいこと', () => {
      const desc = getRoundingDescription('floor', 'yen');
      expect(desc).toBe('1円未満を切り捨て');
    });

    it('round, ten_yen の説明が正しいこと', () => {
      const desc = getRoundingDescription('round', 'ten_yen');
      expect(desc).toBe('10円未満を四捨五入');
    });

    it('ceil, yen の説明が正しいこと', () => {
      const desc = getRoundingDescription('ceil', 'yen');
      expect(desc).toBe('1円未満を切り上げ');
    });
  });
});
