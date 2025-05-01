import { defaultExclude, defineConfig } from 'vitest/config'
import vitestConfig from './vitest.config.mts'

export default defineConfig({
  ...vitestConfig,
  test: {
    ...vitestConfig.test,
    include: ['src/test/dump/**/*.test.ts'],
    exclude: defaultExclude,
  },
})
