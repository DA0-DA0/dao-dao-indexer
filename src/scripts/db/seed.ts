import { Command } from 'commander'

import { loadConfig } from '@/core/config'
import { DbType } from '@/core/types'
import {
  Account,
  AccountKey,
  AccountKeyCredit,
  AccountKeyCreditPaymentSource,
  loadDb,
} from '@/db'

export const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.parse()
  const { config: _config } = program.opts()

  // Load config with config option.
  loadConfig(_config)

  const accountsSequelize = await loadDb({
    type: DbType.Accounts,
  })

  // Setup test account.
  const [testAccount] = await Account.findOrCreate({
    where: {
      publicKey: 'test',
    },
    include: [
      {
        model: AccountKey,
        include: [
          {
            model: AccountKeyCredit,
          },
        ],
      },
    ],
  })
  // Create test account key if it doesn't exist.
  const keys = (await testAccount.$get('keys')) ?? []
  if (!keys.some(({ name }) => name === 'test')) {
    const accountKey = await testAccount.$create<AccountKey>('key', {
      name: 'test',
      description: 'test',
      hashedKey: AccountKey.hashKey('test'),
    })
    // Create test account key infinite test credit.
    await accountKey.$create<AccountKeyCredit>('credit', {
      paymentSource: AccountKeyCreditPaymentSource.Manual,
      paymentId: 'test',
      paidAt: new Date(),
      amount: -1,
    })
  }

  await accountsSequelize.close()
}

main()
