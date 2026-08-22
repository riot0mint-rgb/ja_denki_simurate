import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      // main.tsx / admin.tsx は ReactDOM への受け渡しだけ、rates.ts はデータ定義。
      // どちらもテスト対象の振る舞いを持たない（中身は AdminApp.tsx 側にある）。
      exclude: ['src/main.tsx', 'src/admin.tsx', 'src/test/**', 'src/data/rates.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
})
