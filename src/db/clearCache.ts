import { Command } from 'commander'

import { Computation, loadDb } from './index'

// Parse arguments.
const program = new Command()
program.option(
  '-c, --contracts <contracts>',
  'comma separated list of contract addresses to reset the cache for'
)
program.option(
  '-f, --formulas <formulas>',
  'comma separated list of formula names to reset the cache for'
)
program.parse()
const options = program.opts()

// Deletes computations.
export const main = async () => {
  // Log when altering.
  const sequelize = await loadDb({ logging: true })

  try {
    let count = 0

    // If no filters, drop the table and recreate it to quickly delete all.
    if (!options.contracts && !options.formulas) {
      count = await Computation.count()
      await Computation.sync({ force: true })
    } else {
      // Otherwise just delete the rows that match the filters.
      count = await Computation.destroy({
        where: {
          ...(options.contracts
            ? {
                contractAddress: options.contracts.split(','),
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
        options.contracts || options.formulas
          ? ` matching filters:\n${[
              options.contracts ? `contracts: ${options.contracts}` : '',
              options.formulas ? `formulas: ${options.formulas}` : '',
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
