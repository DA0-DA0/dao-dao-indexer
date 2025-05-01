import { defaultExclude, defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  test: {
    exclude: [...defaultExclude, 'src/test/dump/**'],
    setupFiles: ['./src/test/setup.ts'],
    watch: false,
    hideSkippedTests: true,
    // 1 hour timeout for tests.
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
  },
  plugins: [tsconfigPaths()],
})
