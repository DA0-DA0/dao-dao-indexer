// Import before anything else so the mocks take precedence.
import './mocks'

import { afterAll, beforeEach, vi } from 'vitest'

import { ConfigManager } from '@/config'
import { closeDb, loadDb, setup } from '@/db'
import { closeAllBullQueues } from '@/queues'
import { WasmCodeService } from '@/services/wasm-codes'
import { DbType } from '@/types'

const noTestDbReset =
  process.env.NO_TEST_DB_RESET === 'true' ||
  process.env.NO_TEST_DB_RESET === '1'

ConfigManager.load()

// Don't log errors to the console during tests.
vi.spyOn(console, 'error').mockImplementation(() => {})

// Wipe databases before each test.
beforeEach(async () => {
  const dataSequelize = await loadDb({
    type: DbType.Data,
  })
  const accountsSequelize = await loadDb({
    type: DbType.Accounts,
  })

  // Set up will reset the databases.
  if (!noTestDbReset) {
    await setup(dataSequelize)
    await setup(accountsSequelize)
  }

  // Set up wasm code service.
  await WasmCodeService.setUpInstance()
})

afterAll(async () => {
  await Promise.all([
    // Close DB connections after all tests.
    closeDb(),
    // Close bull queues after all tests.
    closeAllBullQueues(),
  ])
})
