import { defineConfig } from 'vitest/config'

/**
 * ルートの scripts/ 用。料金マスターの生成・差分は改定の入口なので、
 * calc-core と同じくテストで固める（CLAUDE.md ルール6）。
 * apps/ と packages/ はそれぞれのワークスペースで動かす。
 */
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // CLI（*-*.ts）は実ファイル読み込みと process.exit を伴うので対象外。
      // 中身のロジックは純粋関数側（下記）に寄せてあり、そちらは 100% を要求する。
      include: [
        'scripts/rateMasterDiff.ts',
        'scripts/rateIntake.ts',
        'scripts/cliArgs.ts',
        'scripts/securityCheck.ts',
        'scripts/monthlyRatesInsert.ts',
        'scripts/monthlyRatesDiff.ts'
      ],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 }
    }
  }
})
