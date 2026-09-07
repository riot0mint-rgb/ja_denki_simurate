import { computeDefaultPeriod, DEFAULT_PERIOD, availablePeriods } from '../src/monthlyRates';

describe('computeDefaultPeriod', () => {
  it('全事業者＋再エネ賦課金がそろっている最新月を返す', () => {
    const fuelTables = {
      chugoku: { '2026-07': {}, '2026-08': {} },
      au: { '2026-07': {} }
    } as never;
    const levy = { '2026-07': '4.18', '2026-08': '4.18' };
    // auでんきは2026-08が未収録なので、2026-07が「全事業者そろっている最新月」になる
    expect(computeDefaultPeriod(fuelTables, levy)).toEqual({ year: 2026, month: 7 });
  });

  it('該当する年月が1件もなければ例外', () => {
    const fuelTables = { chugoku: {}, au: {} } as never;
    expect(() => computeDefaultPeriod(fuelTables, {})).toThrow('全事業者共通の年月が1件もありません');
  });

  it('実データのDEFAULT_PERIODはauでんきの収録に合わせて決まる', () => {
    // auでんきが中国電力系より収録が遅れているため、既定月はauでんきの最新収録月と一致する
    expect(availablePeriods('au')[0]).toEqual(DEFAULT_PERIOD);
  });
});
