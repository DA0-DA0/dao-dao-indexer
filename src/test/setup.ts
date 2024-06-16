// Import before anything else so the mocks take precedence.
import './mocks'

import { loadConfig } from '@/core/config'
import { DbType } from '@/core/types'
import { closeDb, loadDb, setup } from '@/db'
import { closeAllBullQueues } from '@/queues'
import { WasmCodeService } from '@/services/wasm-codes'

loadConfig()

// Don't log errors during tests.
jest.spyOn(console, 'error').mockImplementation()

// Wipe databases before each test.
beforeEach(async () => {
  const dataSequelize = await loadDb({
    type: DbType.Data,
  })
  const accountsSequelize = await loadDb({
    type: DbType.Accounts,
  })

  await setup(dataSequelize)
  await setup(accountsSequelize)

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
