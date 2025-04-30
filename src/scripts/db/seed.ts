import { Command } from 'commander'

import { ConfigManager } from '@/config'
import {
  Account,
  AccountKey,
  AccountKeyCredit,
  AccountKeyCreditPaymentSource,
  loadDb,
} from '@/db'
import { DbType } from '@/types'

export const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.parse()
  const { config: _config } = program.opts()

  // Load config from specific config file.
  ConfigManager.load(_config)

  const accountsSequelize = await loadDb({
    type: DbType.Accounts,
  })

  // Set up test account.
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
