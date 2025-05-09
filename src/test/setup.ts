// Import before anything else so the mocks take precedence.
import './mocks'

import { afterAll, beforeAll, beforeEach, vi } from 'vitest'

import { ConfigManager } from '@/config'
import { closeDb, loadDb, setup } from '@/db'
import { closeAllBullQueues } from '@/queues'
import { setUpRouter } from '@/server/routes'
import { app as testAccountApp } from '@/server/test/account/app'
import { app as testIndexerApp } from '@/server/test/indexer/app'
import { WasmCodeService } from '@/services/wasm-codes'
import { DbType } from '@/types'

const noTestDbReset =
  process.env.NO_TEST_DB_RESET === 'true' ||
  process.env.NO_TEST_DB_RESET === '1'

ConfigManager.load()

// Don't log errors to the console during tests.
vi.spyOn(console, 'error').mockImplementation(() => {})

// Set up databases and app routers.
beforeAll(async () => {
  const dataSequelize = await loadDb({
    type: DbType.Data,
  })
  const accountsSequelize = await loadDb({
    type: DbType.Accounts,
  })

  // Set up will reset the databases.
  if (!noTestDbReset) {
    await setup(dataSequelize, true, 'data')
    await setup(accountsSequelize, true, 'accounts')
  }

  await setUpRouter(testAccountApp, {
    config: ConfigManager.load(),
    accounts: true,
  })
  await setUpRouter(testIndexerApp, {
    config: ConfigManager.load(),
    accounts: false,
  })

  // Set up wasm code service.
  await WasmCodeService.setUpInstance()
})

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
    await setup(dataSequelize, true, 'data')
    await setup(accountsSequelize, true, 'accounts')
  }
})

afterAll(async () => {
  await Promise.all([
    // Close DB connections after all tests.
    closeDb(),
    // Close bull queues after all tests.
    closeAllBullQueues(),
  ])
})
