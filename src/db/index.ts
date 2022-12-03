import { Sequelize, SequelizeOptions } from 'sequelize-typescript'

import { Config } from '../types'
import { Contract, Event } from './models'

export * from './models'

let sequelize: Sequelize

export const loadDb = async (db: Config['db']) => {
  const options: SequelizeOptions = {
    // Allow options to override logging, but default to false.
    logging: false,

    // User config.
    ...db,

    // Tell Sequelize what models we have.
    models: [Contract, Event],
  }

  // If URI present, use it. Otherwise, use options directly.
  sequelize = db.uri ? new Sequelize(db.uri, options) : new Sequelize(options)

  try {
    await sequelize.authenticate()
    console.log('Connection has been established successfully.')
  } catch (error) {
    console.error('Unable to connect to the database:', error)
  }

  // Alter the database to match any changes.
  // await sequelize.sync({ alter: true })
  // Drop all tables and recreate them.
  // await sequelize.sync({ force: true })
}

export const closeDb = async () => {
  await sequelize.close()
}
