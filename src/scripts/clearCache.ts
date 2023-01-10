import { Command } from 'commander'

import { loadConfig } from '@/core'
import { Computation, loadDb } from '@/db'

// Deletes computations.
export const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.option(
    '-a, --addresses <addresses>',
    'comma separated list of wallet/contract addresses to reset the cache for'
  )
  program.option(
    '-f, --formulas <formulas>',
    'comma separated list of formula names to reset the cache for'
  )
  program.parse()
  const options = program.opts()

  // Load config with config option.
  loadConfig(options.config)

  // Log when altering.
  const sequelize = await loadDb({ logging: true })

  try {
    let count = 0

    // If no filters, drop the tables and recreate them to quickly delete all.
    if (!options.addresses && !options.formulas) {
      count = await Computation.count()
      await Computation.sync({ force: true })
    } else {
      // Otherwise just delete the rows that match the filters.
      count = await Computation.destroy({
        where: {
          ...(options.addresses
            ? {
                targetAddress: options.addresses.split(','),
              }
            : {}),
          ...(options.formulas
            ? {
                formula: options.formulas.split(','),
              }
            : {}),
        },
      })
    }

    console.log(
      `\nCleared ${count.toLocaleString()} computation${
        count === 1 ? '' : 's'
      }${
        options.addresses || options.formulas
          ? ` matching filters:\n${[
              options.addresses
                ? `wallet/contract addresses: ${options.addresses.split(',')}`
                : '',
              options.formulas
                ? `formulas: ${options.formulas.split(',')}`
                : '',
            ]
              .filter(Boolean)
              .join('\n')}`
          : ''
      }.`
    )
  } catch (err) {
    console.error(err)
  }

  await sequelize.close()
}

main()
