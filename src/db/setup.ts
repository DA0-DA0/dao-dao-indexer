import * as readline from 'readline'

import { loadDb } from './index'

export const main = async () => {
  const sequelize = await loadDb()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  rl.question(
    'Are you sure you want to drop all tables? (y/n) ',
    async (answer) => {
      if (answer === 'y') {
        // Drop all tables and recreate them.
        await sequelize.sync({ force: true })
        console.log('Dropped and recreated all tables.')
      } else {
        console.log('Aborted.')
      }

      await sequelize.close()
      process.exit()
    }
  )
}

main()
