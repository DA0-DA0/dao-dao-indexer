import { Command } from 'commander'

import { loadConfig } from '@/core'
import {
  Account,
  AccountKey,
  AccountKeyCredit,
  AccountKeyCreditPaymentSource,
  loadDb,
} from '@/db'

// Migrates to new account system.
const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.option(
    '-a, --accounts <accounts>',
    'comma-separated list of users to seed with'
  )
  program.parse()
  const options = program.opts()

  // Load config with config option.
  loadConfig(options.config)

  // Log when altering.
  const sequelize = await loadDb({ logging: true })

  const seedAccounts = (
    typeof options.accounts === 'string' ? options.accounts : ''
  )
    .split(',')
    .map((a) => ({
      name: a.split(':')[0],
      publicKey: a.split(':')[1],
      hashedKey: a.split(':')[2],
    }))

  try {
    await sequelize.query('DROP TABLE IF EXISTS "AccountCredits" CASCADE;')
    await sequelize.query('DROP TABLE IF EXISTS "Accounts" CASCADE;')

    // Update the account models.
    await Account.sync({ force: true })
    await AccountKey.sync({ force: true })
    await AccountKeyCredit.sync({ force: true })

    // Seed with first users.
    for (const account of seedAccounts) {
      const newAccount = await Account.create({
        publicKey: account.publicKey,
      })

      const newKey = await newAccount.$create('key', {
        name: account.name,
        hashedKey: account.hashedKey,
      })

      await newKey.$create('credit', {
        paymentSource: AccountKeyCreditPaymentSource.Manual,
        paymentId: account.name,
      })
    }

    console.log('\nMigrated.')
  } catch (err) {
    console.error(err)
  }

  await sequelize.close()
}

main()
