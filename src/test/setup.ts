// Import before anything else so the mocks take precedence.
import './mocks'

import { loadConfig } from '@/core/config'
import { DbType } from '@/core/types'
import { closeDb, loadDb, setup } from '@/db'

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
})

// Close connections after all tests.
afterAll(closeDb)
