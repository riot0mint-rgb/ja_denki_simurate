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
      include: ['scripts/rateMasterDiff.ts', 'scripts/rateIntake.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 }
    }
  }
})
