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

  // Alter the database to match the model classes we defined.
  try {
    await sequelize.sync({ alter: true })
  } catch (error) {
    console.error('Unable to sync database:', error)
  }
}

export const closeDb = async () => {
  await sequelize.close()
}
